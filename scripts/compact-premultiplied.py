"""Downscale keyed WebM clips to 640 wide using premultiplied-alpha resampling.

Straight-alpha resizing averages the (black) RGB of fully transparent pixels into
the visible edge, which is what produced the light/dark fringe in the compact set.
Premultiplying first, resizing colour and alpha together, then unpremultiplying
keeps edges clean.

Usage: python compact-premultiplied.py <in-dir> <out-dir> [--width 640] [--crf 30]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FFMPEG = ROOT / '.venv' / 'Lib' / 'site-packages' / 'imageio_ffmpeg' / 'binaries' / \
    'ffmpeg-win-x86_64-v7.1.exe'


def probe(ffmpeg: str, path: Path) -> tuple[int, int, float, int]:
    out = subprocess.run([ffmpeg, '-hide_banner', '-c:v', 'libvpx-vp9', '-i', str(path)],
                         capture_output=True).stderr.decode('utf-8', 'replace')
    w = h = 0
    fps = 24.0
    for line in out.splitlines():
        if 'Video:' in line:
            for token in line.split(','):
                token = token.strip()
                if 'x' in token and token.split('x')[0].isdigit() and token.split('x')[-1].split()[0].isdigit():
                    w, h = (int(v) for v in token.split()[:1][0].split('x')[:2])
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


def convert(ffmpeg: str, src: Path, dst: Path, width: int, crf: int) -> None:
    w, h, fps, frames = probe(ffmpeg, src)
    if not w or not h:
        raise SystemExit(f'cannot probe {src}')
    out_w = width
    out_h = int(round(h * out_w / w / 2.0)) * 2
    dec = subprocess.Popen([ffmpeg, '-v', 'error', '-c:v', 'libvpx-vp9', '-i', str(src),
                            '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen([ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
                            '-s', f'{out_w}x{out_h}', '-r', f'{fps:g}', '-i', 'pipe:0',
                            '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', str(crf),
                            '-b:v', '0', '-an', '-row-mt', '1', str(dst)],
                           stdin=subprocess.PIPE)
    size = w * h * 4
    count = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(h, w, 4)
        a = frame[:, :, 3].astype(np.float32) / 255.0
        pm = frame[:, :, :3].astype(np.float32) * a[:, :, None]
        pm_s = cv2.resize(pm, (out_w, out_h), interpolation=cv2.INTER_AREA)
        a_s = cv2.resize(a, (out_w, out_h), interpolation=cv2.INTER_AREA)
        rgb = np.zeros_like(pm_s)
        nz = a_s > 1e-4
        rgb[nz] = pm_s[nz] / a_s[nz][:, None]
        out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8),
                         np.clip(a_s * 255.0, 0, 255).astype(np.uint8)])
        enc.stdin.write(out.tobytes())
        count += 1
    dec.stdout.close()
    dec.wait()
    enc.stdin.close()
    enc.wait()
    if enc.returncode != 0:
        raise SystemExit(f'encode failed: {dst}')
    print(f'{src.name}: {w}x{h} {count}f -> {out_w}x{out_h} {dst.stat().st_size / 1048576:.2f}MB')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src_dir', type=Path)
    ap.add_argument('dst_dir', type=Path)
    ap.add_argument('names', nargs='*')
    ap.add_argument('--width', type=int, default=640)
    ap.add_argument('--crf', type=int, default=30)
    ap.add_argument('--ffmpeg', default=str(DEFAULT_FFMPEG))
    args = ap.parse_args()
    args.dst_dir.mkdir(parents=True, exist_ok=True)
    srcs = ([args.src_dir / f'{n}.webm' for n in args.names] if args.names
            else sorted(args.src_dir.glob('*.webm')))
    for src in srcs:
        if not src.exists():
            print(f'missing {src}', file=sys.stderr)
            continue
        convert(args.ffmpeg, src, args.dst_dir / src.name, args.width, args.crf)


if __name__ == '__main__':
    main()
