"""Match a clip's colour to the library median (saturation down, brightness up).

The 10-second batch of animations was generated with a warmer, more saturated
grade than the older clips: same-region saturation is ~18% higher, magenta area
is 6-7x larger, and skin is a bit darker.  This script re-grades the affected
masters so the whole library reads as one palette.  Alpha is never touched.

Usage:
  python color-match-animations.py [names...] [--src-dir DIR] [--out-dir DIR]
         [--target-sat 39.2] [--target-v 197.8] [--min-sat-gain 0.80]
         [--max-v-gain 1.05] [--crf 18] [--dry-run]
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FFMPEG = ROOT / '.venv' / 'Lib' / 'site-packages' / 'imageio_ffmpeg' / 'binaries' / \
    'ffmpeg-win-x86_64-v7.1.exe'
DEFAULT_SRC = ROOT / 'assets' / 'animations-original'
DEFAULT_OUT = ROOT / 'work' / 'color-match'
SAMPLE_TIMES = (0.6, 2.2, 4.0, 6.5, 8.5)


def probe(ffmpeg: str, path: Path) -> tuple[int, int, float, int]:
    out = subprocess.run([ffmpeg, '-hide_banner', '-c:v', 'libvpx-vp9', '-i', str(path)],
                         capture_output=True).stderr.decode('utf-8', 'replace')
    w = h = 0
    fps = 24.0
    for line in out.splitlines():
        if 'Video:' not in line:
            continue
        for token in line.split(','):
            token = token.strip()
            if 'x' in token:
                head = token.split()[0]
                if head.count('x') == 1 and head.split('x')[0].isdigit() and head.split('x')[1].isdigit():
                    w, h = (int(v) for v in head.split('x'))
            if token.endswith('fps'):
                try:
                    fps = float(token[:-3])
                except ValueError:
                    pass
    dur = 0.0
    for line in out.splitlines():
        if 'Duration:' in line:
            hh, mm, ss = line.split('Duration:')[1].split(',')[0].strip().split(':')
            dur = int(hh) * 3600 + int(mm) * 60 + float(ss)
    return w, h, fps, int(round(dur * fps))


def grab(ffmpeg: str, path: Path, t: float, w: int, h: int) -> np.ndarray | None:
    size = w * h * 4
    out = subprocess.run([ffmpeg, '-v', 'error', '-c:v', 'libvpx-vp9', '-ss', f'{t:.2f}',
                          '-i', str(path), '-frames:v', '1', '-f', 'rawvideo',
                          '-pix_fmt', 'rgba', 'pipe:1'], capture_output=True).stdout
    if len(out) < size:
        return None
    return np.frombuffer(out[:size], np.uint8).reshape(h, w, 4).copy()


def stats(ffmpeg: str, path: Path, w: int, h: int) -> tuple[float, float] | None:
    sats: list[float] = []
    vs: list[float] = []
    for t in SAMPLE_TIMES:
        img = grab(ffmpeg, path, t, w, h)
        if img is None:
            continue
        mask = img[:, :, 3] > 200
        if mask.sum() < 2000:
            continue
        hsv = cv2.cvtColor(img[:, :, :3], cv2.COLOR_RGB2HSV)
        sats.append(float(hsv[:, :, 1][mask].mean()))
        vs.append(float(hsv[:, :, 2][mask].mean()))
    if not sats:
        return None
    return float(np.mean(sats)), float(np.mean(vs))


def regrade(ffmpeg: str, src: Path, dst: Path, w: int, h: int, fps: float,
            sat_gain: float, v_gain: float, crf: int) -> int:
    dec = subprocess.Popen([ffmpeg, '-v', 'error', '-c:v', 'libvpx-vp9', '-i', str(src),
                            '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen([ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
                            '-s', f'{w}x{h}', '-r', f'{fps:g}', '-i', 'pipe:0', '-an',
                            '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
                            '-auto-alt-ref', '0', '-b:v', '0', '-crf', str(crf),
                            '-deadline', 'good', '-cpu-used', '4', str(dst)],
                           stdin=subprocess.PIPE)
    size = w * h * 4
    frames = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(h, w, 4)
        alpha = frame[:, :, 3:4]
        hsv = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_RGB2HSV)
        hsv = hsv.astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * sat_gain, 0, 255)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * v_gain, 0, 255)
        rgb = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB)
        enc.stdin.write(np.dstack([rgb, alpha]).tobytes())
        frames += 1
    dec.stdout.close()
    dec.wait()
    enc.stdin.close()
    enc.wait()
    if enc.returncode != 0:
        raise SystemExit(f'encode failed: {dst}')
    return frames


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*')
    ap.add_argument('--src-dir', type=Path, default=DEFAULT_SRC)
    ap.add_argument('--out-dir', type=Path, default=DEFAULT_OUT)
    ap.add_argument('--target-sat', type=float, default=39.2)
    ap.add_argument('--target-v', type=float, default=197.8)
    ap.add_argument('--min-sat-gain', type=float, default=0.80)
    ap.add_argument('--max-v-gain', type=float, default=1.05)
    ap.add_argument('--min-sat-drop', type=float, default=0.03,
                    help='skip clips whose saturation is within this of the target')
    ap.add_argument('--crf', type=int, default=18)
    ap.add_argument('--ffmpeg', default=str(DEFAULT_FFMPEG))
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    srcs = ([args.src_dir / f'{n}.webm' for n in args.names] if args.names
            else sorted(args.src_dir.glob('*.webm')))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        if not src.exists():
            print(f'missing {src}', file=sys.stderr)
            continue
        w, h, fps, _ = probe(args.ffmpeg, src)
        got = stats(args.ffmpeg, src, w, h)
        if got is None or not w:
            print(f'skip {src.name} (no stats)', file=sys.stderr)
            continue
        sat, v = got
        sat_gain = min(1.0, max(args.min_sat_gain, args.target_sat / sat))
        v_gain = min(args.max_v_gain, max(0.98, args.target_v / v))
        label = f'{src.stem:26s} sat={sat:5.1f} v={v:6.1f} -> sat_gain={sat_gain:.3f} v_gain={v_gain:.3f}'
        if 1.0 - sat_gain < args.min_sat_drop:
            print(f'{label}  (already on-palette, skipped)')
            continue
        if args.dry_run:
            print(label)
            continue
        dst = args.out_dir / src.name
        frames = regrade(args.ffmpeg, src, dst, w, h, fps, sat_gain, v_gain, args.crf)
        print(f'{label}  {frames}f -> {dst} ({dst.stat().st_size / 1048576:.2f}MB)')


if __name__ == '__main__':
    main()
