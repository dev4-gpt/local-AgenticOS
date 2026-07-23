#!/usr/bin/env python3
"""Store scoped X research credentials without exposing them to shell history."""

from __future__ import annotations

import getpass
import os
import re
import stat
from pathlib import Path

from agent_reach.config import Config


TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9._~-]+$")


def read_secret(label: str) -> str:
    value = getpass.getpass(label).strip()
    if not value:
        raise SystemExit("No value entered. Nothing changed.")
    if len(value) > 2_000 or not TOKEN_PATTERN.fullmatch(value):
        raise SystemExit(f"{label.rstrip(': ')} has an unexpected format. Nothing changed.")
    return value


def write_private_env(path: Path, auth_token: str, ct0: str) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    content = (
        f"TWITTER_AUTH_TOKEN={auth_token}\n"
        f"TWITTER_CT0={ct0}\n"
    ).encode("utf-8")
    fd = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
        stat.S_IRUSR | stat.S_IWUSR,
    )
    with os.fdopen(fd, "wb") as handle:
        handle.write(content)
    os.chmod(path, 0o600)


def main() -> None:
    print("Veloce AgenticOS - X research credential setup")
    print("Enter only the auth_token and ct0 values from the dedicated research profile.")
    print("Input is hidden and is never written to this project or shell history.")

    auth_token = read_secret("Paste X auth_token: ")
    ct0 = read_secret("Paste X ct0: ")

    config = Config()
    config.set("twitter_auth_token", auth_token)
    config.set("twitter_ct0", ct0)
    env_path = Path.home() / ".agent-reach" / "twitter.env"
    write_private_env(env_path, auth_token, ct0)

    print(f"Credentials saved locally in {config.config_path} and {env_path}.")
    print("Both files are private (0600). No browser Keychain access is required.")


if __name__ == "__main__":
    main()
