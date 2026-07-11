#!/usr/bin/env python3
import argparse
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


def write_job(path: Path, **data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def palette(seed: int):
    palettes = [
        ((18, 16, 26), (212, 165, 116), (90, 184, 150)),
        ((10, 19, 28), (120, 180, 255), (244, 114, 182)),
        ((22, 18, 15), (230, 198, 154), (196, 96, 126)),
        ((12, 22, 20), (88, 214, 164), (214, 165, 116)),
    ]
    return palettes[seed % len(palettes)]


def word_seed(text: str) -> int:
    return sum((i + 1) * ord(ch) for i, ch in enumerate(text)) % 9973


def clamp(v: float) -> int:
    return max(0, min(255, int(v)))


def render_ppm(path: Path, prompt: str, index: int, total: int, width: int = 960, height: int = 540):
    seed = word_seed(prompt) + index * 137
    bg, a, b = palette(seed)
    cx = width * (0.2 + 0.6 * ((seed % 71) / 70))
    cy = height * (0.25 + 0.55 * (((seed // 71) % 71) / 70))
    horizon = height * (0.56 + 0.08 * math.sin(seed))
    data = bytearray()
    data.extend(f"P6\n{width} {height}\n255\n".encode("ascii"))
    for y in range(height):
        yn = y / max(1, height - 1)
        for x in range(width):
            xn = x / max(1, width - 1)
            dx = (x - cx) / width
            dy = (y - cy) / height
            glow = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) * 2.7)
            sweep = max(0.0, 1.0 - abs(y - horizon - math.sin((x + seed) * 0.015) * 18) / 95)
            stars = 0
            if y < horizon and ((x * 73856093 ^ y * 19349663 ^ seed) % 997) < 2:
                stars = 120
            letterbox = 0.28 if y < height * 0.08 or y > height * 0.92 else 1.0
            vignette = 0.55 + 0.45 * (1.0 - min(1.0, math.sqrt((xn - 0.5) ** 2 + (yn - 0.5) ** 2) * 1.45))
            grain = ((x * 17 + y * 31 + seed * 13) % 19) - 9
            r = (bg[0] + a[0] * glow * 0.72 + b[0] * sweep * 0.35 + stars + grain) * letterbox * vignette
            g = (bg[1] + a[1] * glow * 0.72 + b[1] * sweep * 0.35 + stars + grain) * letterbox * vignette
            bl = (bg[2] + a[2] * glow * 0.72 + b[2] * sweep * 0.35 + stars + grain) * letterbox * vignette
            data.extend(bytes((clamp(r), clamp(g), clamp(bl))))
    path.write_bytes(data)


def build_video(frames, out_file: Path, seconds_per_shot: float):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found")
    concat = out_file.with_suffix(".concat.txt")
    with concat.open("w", encoding="utf-8") as f:
        for frame in frames:
            f.write(f"file '{frame.as_posix()}'\n")
            f.write(f"duration {seconds_per_shot:.2f}\n")
        f.write(f"file '{frames[-1].as_posix()}'\n")
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat),
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p",
            "-r",
            "30",
            "-movflags",
            "+faststart",
            str(out_file),
        ],
        check=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--shots", type=int, default=6)
    parser.add_argument("--out", required=True)
    parser.add_argument("--job", required=True)
    args = parser.parse_args()

    job = Path(args.job)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    shots = max(2, min(args.shots, 10))
    title = args.prompt.strip()[:80]

    write_job(job, status="planning", progress=5, message="Planning local cinematic sequence...", title=title)
    with tempfile.TemporaryDirectory(prefix="openmontage-") as tmp:
        tmpdir = Path(tmp)
        frames = []
        for i in range(shots):
            write_job(job, status="rendering", progress=10 + int((i / shots) * 65), message=f"Rendering shot {i + 1}/{shots}...", title=title)
            frame = tmpdir / f"shot_{i:03d}.ppm"
            render_ppm(frame, args.prompt, i, shots)
            frames.append(frame)
        write_job(job, status="assembling", progress=82, message="Assembling MP4 with ffmpeg...", title=title)
        build_video(frames, out, 1.7)

    write_job(job, status="done", progress=100, message="OpenMontage local cinematic complete.", title=title, video=out.name)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        job_arg = None
        if "--job" in os.sys.argv:
            try:
                job_arg = Path(os.sys.argv[os.sys.argv.index("--job") + 1])
            except Exception:
                job_arg = None
        if job_arg:
            write_job(job_arg, status="error", progress=100, message=str(exc), title="OpenMontage error")
        raise
