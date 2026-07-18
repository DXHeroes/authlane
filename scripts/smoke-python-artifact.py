from __future__ import annotations

import argparse
import os
import subprocess
import tempfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).parents[1]
REQUIREMENTS = REPOSITORY_ROOT / "packages" / "python" / "release-requirements.txt"
SMOKE_SCRIPT = REPOSITORY_ROOT / "scripts" / "python-package-smoke.py"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    artifact = parser.parse_args().artifact.resolve()
    if not artifact.is_file():
        raise SystemExit(f"artifact does not exist: {artifact}")

    with tempfile.TemporaryDirectory(prefix="authlane-python-artifact-") as directory:
        environment = Path(directory) / "venv"
        subprocess.run(
            ["uv", "venv", "--python", "3.11", str(environment)],
            check=True,
            cwd=directory,
        )
        python = (
            environment / "Scripts" / "python.exe"
            if os.name == "nt"
            else environment / "bin" / "python"
        )
        subprocess.run(
            [
                "uv",
                "pip",
                "install",
                "--python",
                str(python),
                "--require-hashes",
                "--requirements",
                str(REQUIREMENTS),
            ],
            check=True,
            cwd=directory,
        )
        subprocess.run(
            [
                "uv",
                "pip",
                "install",
                "--python",
                str(python),
                "--no-deps",
                "--no-build-isolation",
                str(artifact),
            ],
            check=True,
            cwd=directory,
        )
        subprocess.run(
            [str(python), "-I", str(SMOKE_SCRIPT)],
            check=True,
            cwd=directory,
        )
    print(f"Smoke-tested installed artifact {artifact.name}")


if __name__ == "__main__":
    main()
