#!/usr/bin/env python3
import argparse
import importlib.util
from pathlib import Path


def load_cinematic():
    script = Path(__file__).with_name("cinematic_om.py")
    spec = importlib.util.spec_from_file_location("cinematic_om", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load cinematic OpenMontage renderer")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--clips", type=int, default=3)
    parser.add_argument("--out", required=True)
    parser.add_argument("--job", required=True)
    args = parser.parse_args()

    cinematic = load_cinematic()
    prompt = f"{args.prompt} -- movie-mode local procedural sequence"
    shots = max(2, min(args.clips * 2, 8))
    cinematic_args = [
        "cinematic_om.py",
        "--prompt", prompt,
        "--shots", str(shots),
        "--out", args.out,
        "--job", args.job,
    ]
    import sys
    old = sys.argv
    try:
        sys.argv = cinematic_args
        cinematic.main()
    finally:
        sys.argv = old


if __name__ == "__main__":
    main()
