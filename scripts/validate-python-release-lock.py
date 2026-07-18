from __future__ import annotations

import subprocess
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).parents[1]
REQUIREMENTS = REPOSITORY_ROOT / "packages" / "python" / "release-requirements.txt"
EXPORT_COMMAND = [
    "uv",
    "export",
    "--project",
    "packages/python",
    "--frozen",
    "--no-dev",
    "--group",
    "release",
    "--no-emit-project",
    "--format",
    "requirements-txt",
    "--no-header",
]


def main() -> None:
    subprocess.run(
        ["uv", "lock", "--project", "packages/python", "--check"],
        check=True,
        cwd=REPOSITORY_ROOT,
    )
    generated = subprocess.run(
        EXPORT_COMMAND,
        check=True,
        cwd=REPOSITORY_ROOT,
        stdout=subprocess.PIPE,
    ).stdout
    committed = REQUIREMENTS.read_bytes()
    if generated != committed:
        update = " ".join(
            [
                *EXPORT_COMMAND,
                "--output-file",
                "packages/python/release-requirements.txt",
            ]
        )
        raise SystemExit(
            f"Python release requirements are stale. Regenerate with:\n{update}"
        )
    print("Python release requirements match packages/python/uv.lock")


if __name__ == "__main__":
    main()
