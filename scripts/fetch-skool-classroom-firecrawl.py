"""Refuse automated Skool collection; use a platform-approved owner export."""

import argparse
import sys


REFUSAL = (
    "Automated Skool collection is disabled. Do not send Skool session cookies "
    "to Firecrawl. Obtain a platform-approved owner export, then prepare it "
    "with scripts/prepare-classroom-source-pack.mjs."
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="Unused; automated Skool collection is disabled")
    parser.add_argument("--execute", action="store_true", help="Refused; no network request will be made")
    parser.parse_args(argv)
    print(REFUSAL, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
