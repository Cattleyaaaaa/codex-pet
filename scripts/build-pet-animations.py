"""Build lossless animated WebP clips from the reviewed ChatGPT Pet atlas frames."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "artifacts" / "Pets" / "Codex白龙" / "revisions" / "dynamic" / "qa" / "standard-frames"
OUTPUT = ROOT / "assets" / "animations" / "pet"

CLIPS = {
    "idle": ("idle", 480),
    "running-right": ("running-right", 180),
    "running-left": ("running-left", 180),
    "waving": ("waving", 360),
    "jumping": ("jumping", 350),
    "failed": ("failed", 280),
    "waiting": ("waiting", 450),
    "running": ("running", 360),
    "review": ("review", 390),
}

OUTPUT.mkdir(parents=True, exist_ok=True)
for filename, (state, duration) in CLIPS.items():
    paths = sorted((FRAMES / state).glob("*.png"))
    if not paths:
        raise SystemExit(f"No frame PNGs found for {state}: {FRAMES / state}")
    frames = [Image.open(path).convert("RGBA") for path in paths]
    size = frames[0].size
    if any(frame.size != size for frame in frames):
        raise SystemExit(f"Frame size mismatch in {state}")
    output = OUTPUT / f"{filename}.webp"
    frames[0].save(
        output,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        lossless=True,
        quality=100,
        method=2,
        exact=True,
    )
    try:
        with Image.open(output) as check:
            if check.n_frames != len(frames) or check.size != size:
                raise ValueError("Animation validation mismatch")
    except Exception:
        frames[0].save(
            output,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=duration,
            loop=0,
            quality=94,
            method=4,
        )
        with Image.open(output) as check:
            if check.n_frames != len(frames) or check.size != size:
                raise SystemExit(f"Could not validate generated WebP: {output}")
    print(f"{output.relative_to(ROOT)}: {len(frames)} frames × {duration} ms")
