"""Key a green-screen MP4 into a continuous transparent VP9 WebM.

Requires Python 3.10+, numpy, opencv-python-headless, FFmpeg and FFprobe.
The source is never overwritten. See assets/animations/README.md for commands.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError as exc:
    raise SystemExit(
        "缺少 Python 依赖。请运行：py -3 -m pip install numpy opencv-python-headless"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "work" / "keyed-videos"


def executable(value: str, label: str) -> str:
    path = Path(value)
    if path.is_file():
        return str(path.resolve())
    found = shutil.which(value)
    if found:
        return found
    raise SystemExit(f"找不到 {label}: {value}。请传入 --{label.lower()} 的完整路径。")


def video_info(ffprobe: str | None, ffmpeg: str, source: Path) -> tuple[int, int, float]:
    if ffprobe:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height,avg_frame_rate", "-of", "json", str(source)],
            capture_output=True, text=True, check=True,
        )
        streams = json.loads(result.stdout).get("streams", [])
        if not streams:
            raise ValueError(f"没有视频流: {source}")
        stream = streams[0]
        rate = stream.get("avg_frame_rate", "0/1")
        numerator, denominator = (int(part) for part in rate.split("/"))
        fps = numerator / denominator if denominator else 0
        return int(stream["width"]), int(stream["height"]), fps

    # Some local FFmpeg distributions do not include FFprobe. Read the video
    # stream description from FFmpeg's own input report in that case.
    result = subprocess.run([ffmpeg, "-hide_banner", "-i", str(source)],
                            capture_output=True, text=True, errors="replace")
    stream = next((line for line in result.stderr.splitlines() if "Video:" in line), "")
    size = re.search(r"\b(\d{2,5})x(\d{2,5})\b", stream)
    rate = re.search(r"\b(\d+(?:\.\d+)?)\s+fps\b", stream)
    if not size:
        raise ValueError(f"无法读取视频尺寸: {source}\n{result.stderr}")
    return int(size.group(1)), int(size.group(2)), float(rate.group(1)) if rate else 0.0


def matte_frame(rgb: np.ndarray, args: argparse.Namespace) -> np.ndarray:
    """Color difference key + spatial cleanup; returns straight-alpha RGBA."""
    rgb = rgb.copy()
    h, w = rgb.shape[:2]
    channels = rgb.astype(np.float32)
    red, green, blue = channels[:, :, 0], channels[:, :, 1], channels[:, :, 2]
    excess = green - np.maximum(red, blue)

    # Generators often produce muted olive instead of #00FF00. Combine an
    # absolute green difference for vivid screens with a relative difference
    # for shaded/muted screens. White hair has little green excess in either.
    absolute = np.clip((excess - args.green_low) / (args.green_high - args.green_low), 0, 1)
    relative_excess = excess / np.maximum(green, 1)
    relative = np.clip((relative_excess - args.relative_low)
                       / (args.relative_high - args.relative_low), 0, 1)
    strength = np.maximum(absolute, relative)
    brightness = np.clip((green - args.min_green) / 30.0, 0, 1)
    alpha = (255.0 * (1.0 - strength * brightness)).astype(np.uint8)

    # A soft key can otherwise leave a low-alpha green haze over the whole
    # background. The center of the green screen should always be empty.
    alpha[alpha < args.alpha_floor] = 0

    # Remove dark neutral ground shadows without eating dark shoe contours.
    # This only affects the bottom strip and preserves pixels close to bright
    # or colored shoe pixels. It can be disabled for low/jumping feet.
    if args.shadow_strip > 0:
        lower = np.arange(h)[:, None] >= int(h * (1.0 - args.shadow_strip))
        brightest = np.maximum(np.maximum(red, green), blue)
        darkest = np.minimum(np.minimum(red, green), blue)
        # The shoe soles are dark purple while the painted ground shadow is
        # neutral or olive.  Preserve those purple pixels even when their
        # overall saturation is low.
        purple_sole = (blue - green > 7) | (red - green > 7)
        neutral_dark = (brightest < args.shadow_max) & (brightest - darkest < 26) & ~purple_sole
        shoe_anchor = (alpha > 220) & ((brightest >= args.shadow_max) | (brightest - darkest >= 26))
        shoe_anchor &= np.broadcast_to(lower, (h, w))
        # A wide protection halo preserves the source's painted ground shadow
        # as a gray fringe around each shoe at desktop-pet size.  Two source
        # pixels are enough to retain the antialiased shoe outline.
        radius = max(2, round(h / 360))
        near_shoe = cv2.dilate(
            shoe_anchor.astype(np.uint8),
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1)),
        ).astype(bool)
        alpha[np.broadcast_to(lower, (h, w)) & neutral_dark & ~near_shoe] = 0

    # Remove disconnected encoder noise. Keep sizeable detached details near
    # the body (e.g. a moving tail tip); reject fragments far from it.
    candidate = (alpha >= args.component_alpha).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, connectivity=8)
    if count > 1:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        left, top, width, height, _ = stats[main]
        margin = max(12, round(max(width, height) * 0.1))
        keep = np.zeros(count, dtype=bool)
        keep[main] = True
        for component in range(1, count):
            if component == main or stats[component, cv2.CC_STAT_AREA] < args.min_area:
                continue
            x, y, cw, ch, _ = stats[component]
            if (x < left + width + margin and x + cw > left - margin
                    and y < top + height + margin and y + ch > top - margin):
                keep[component] = True
        # Soft border pixels have no binary label. Retain them only within two
        # pixels of a retained solid component.
        retained = cv2.dilate(keep[labels].astype(np.uint8), np.ones((5, 5), np.uint8))
        alpha[retained == 0] = 0
    else:
        alpha[:] = 0

    if args.erode:
        alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8), iterations=args.erode)
    if args.feather:
        alpha = cv2.GaussianBlur(alpha, (0, 0), args.feather)
    alpha[alpha < args.alpha_floor] = 0

    # Despill only the contour. White hair and purple costume stay untouched.
    edge = (alpha > 0) & (alpha < 250)
    if args.despill:
        edge = cv2.dilate(edge.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        limit = np.maximum(red, blue) + args.despill
        corrected = np.minimum(green, limit)
        rgb[:, :, 1][edge] = corrected[edge].astype(np.uint8)
    rgb[alpha == 0] = 0
    return np.dstack((rgb, alpha))


def write_png(path: Path, image: np.ndarray) -> bool:
    """cv2.imwrite cannot open non-ASCII paths on Windows, so encode and write bytes."""
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        return False
    path.write_bytes(buffer.tobytes())
    return True


def read_frame(stream, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = stream.read(size - len(chunks))
        if not chunk:
            break
        chunks.extend(chunk)
    if chunks and len(chunks) != size:
        raise RuntimeError("FFmpeg 返回了不完整的视频帧")
    return bytes(chunks)


def convert(source: Path, output: Path, args: argparse.Namespace, ffmpeg: str, ffprobe: str | None) -> None:
    width, height, source_fps = video_info(ffprobe, ffmpeg, source)
    target_width = int(width * args.crop) // 2 * 2
    target_height = height // 2 * 2
    if target_width < 32 or target_height < 32:
        raise ValueError("输入视频或裁剪区域太小")
    left = (width - target_width) // 2
    frame_size = target_width * target_height * 3
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not args.overwrite:
        raise FileExistsError(f"输出已存在，使用 --overwrite 才能替换: {output}")
    staged = output.with_name(output.stem + ".partial.webm")
    if staged.exists():
        staged.unlink()
    preview = output.with_suffix(".preview.png")
    decode = [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(source),
              "-an", "-vf", f"crop={target_width}:{target_height}:{left}:0,fps={args.fps}",
              "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    encode = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
              "-pix_fmt", "rgba", "-s", f"{target_width}x{target_height}",
              "-r", str(args.fps), "-i", "pipe:0", "-an", "-c:v", "libvpx-vp9",
              "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0",
              "-crf", str(args.crf), "-deadline", "good", "-cpu-used", "4", str(staged)]
    decoder = encoder = None
    frames = 0
    preview_written = False
    try:
        decoder = subprocess.Popen(decode, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        encoder = subprocess.Popen(encode, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        assert decoder.stdout is not None and encoder.stdin is not None
        while data := read_frame(decoder.stdout, frame_size):
            rgb = np.frombuffer(data, dtype=np.uint8).reshape(target_height, target_width, 3)
            rgba = matte_frame(rgb, args)
            if frames == args.preview_frame:
                preview_written = write_png(preview, cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
            encoder.stdin.write(rgba.tobytes())
            frames += 1
            if frames % 48 == 0:
                print(f"{source.name}: {frames} 帧", flush=True)
        encoder.stdin.close()
        decoder.stdout.close()
        decode_error = decoder.stderr.read().decode("utf-8", "replace")
        encode_error = encoder.stderr.read().decode("utf-8", "replace")
        if decoder.wait() or encoder.wait() or not frames:
            raise RuntimeError(f"视频转换失败 ({frames} 帧)\n{decode_error}\n{encode_error}")
        staged.replace(output)
        print(f"完成: {output} ({frames} 帧, {target_width}x{target_height}, 原片 {source_fps:.2f} fps)")
        if preview_written:
            print(f"透明预览: {preview}")
    except Exception:
        if staged.exists():
            staged.unlink()
        raise
    finally:
        for process in (decoder, encoder):
            if process and process.poll() is None:
                process.kill()
                process.wait()
        if decoder and decoder.stderr:
            decoder.stderr.close()
        if encoder and encoder.stderr:
            encoder.stderr.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="绿幕 MP4 → 透明 VP9 WebM（连续视频）")
    parser.add_argument("inputs", nargs="+", type=Path, help="一个或多个绿幕 MP4")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="", help="可选；缺省时由 FFmpeg 读取视频尺寸")
    parser.add_argument("--crop", type=float, default=0.625, help="保留画面中央宽度比例；1=不裁剪")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--green-low", type=float, default=16, help="开始透明的绿色差值")
    parser.add_argument("--green-high", type=float, default=75, help="完全透明的绿色差值")
    parser.add_argument("--relative-low", type=float, default=0.005, help="灰绿背景的相对绿差起点")
    parser.add_argument("--relative-high", type=float, default=0.06, help="灰绿背景的相对绿差终点")
    parser.add_argument("--min-green", type=float, default=30, help="抑制深色误抠")
    parser.add_argument("--alpha-floor", type=int, default=10)
    parser.add_argument("--component-alpha", type=int, default=80)
    parser.add_argument("--min-area", type=int, default=70, help="保留的独立片段最小像素数")
    parser.add_argument("--erode", type=int, choices=(0, 1, 2), default=1, help="轮廓内收像素数")
    parser.add_argument("--feather", type=float, default=0.55, help="轮廓羽化 sigma")
    parser.add_argument("--despill", type=float, default=8, help="边缘允许的绿色溢出")
    parser.add_argument("--shadow-strip", type=float, default=0.10, help="底部暗影清理区域占画面高度")
    parser.add_argument("--shadow-max", type=float, default=170)
    parser.add_argument("--crf", type=int, choices=range(0, 64), metavar="0-63", default=18)
    parser.add_argument("--preview-frame", type=int, default=24, help="导出第几帧的透明 PNG；-1 禁用")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if not (0 < args.crop <= 1 and 0 < args.green_low < args.green_high
            and 0 <= args.relative_low < args.relative_high <= 1
            and 0 <= args.shadow_strip < 0.5 and args.fps > 0 and args.min_area > 0):
        parser.error("检查 --crop、绿幕阈值、--shadow-strip、--fps 和 --min-area")
    ffmpeg = executable(args.ffmpeg, "FFmpeg")
    ffprobe = executable(args.ffprobe, "FFprobe") if args.ffprobe else None
    for source in args.inputs:
        if not source.is_file():
            raise SystemExit(f"找不到输入视频: {source}")
        destination = args.output_dir / (source.stem + ".webm")
        convert(source.resolve(), destination.resolve(), args, ffmpeg, ffprobe)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
