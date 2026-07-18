from __future__ import annotations

import argparse
import json
from pathlib import Path

PACKAGE_ROOT = Path(__file__).parents[1]
REPOSITORY_ROOT = PACKAGE_ROOT.parents[1]
SOURCE = REPOSITORY_ROOT / "packages/integration-contracts/generated/v1/integrations.json"
TARGET = PACKAGE_ROOT / "src/authlane/_generated/integrations.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    source_bytes = SOURCE.read_bytes()
    document = json.loads(source_bytes)
    services = document.get("integrations", [])
    tools = [tool for service in services for tool in service.get("tools", [])]
    if len(services) != 15 or len(tools) != 119:
        raise SystemExit("Canonical contract must contain exactly 15 services and 119 tools")

    if args.check:
        if not TARGET.exists() or TARGET.read_bytes() != source_bytes:
            raise SystemExit(
                "Generated Python contracts are stale; run scripts/generate_contracts.py"
            )
        return

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(source_bytes)


if __name__ == "__main__":
    main()
