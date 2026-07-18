from __future__ import annotations

import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

PACKAGE_ROOT = Path(__file__).parents[1]


def test_wheel_and_sdist_contain_typed_generated_mit_package(tmp_path: Path) -> None:
    subprocess.run(
        [sys.executable, "-m", "build", "--outdir", str(tmp_path)],
        cwd=PACKAGE_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    wheel = next(tmp_path.glob("authlane-*.whl"))
    sdist = next(tmp_path.glob("authlane-*.tar.gz"))

    with zipfile.ZipFile(wheel) as archive:
        wheel_names = set(archive.namelist())
        metadata_name = next(name for name in wheel_names if name.endswith(".dist-info/METADATA"))
        metadata = archive.read(metadata_name).decode()
    assert "authlane/py.typed" in wheel_names
    assert "authlane/_generated/integrations.json" in wheel_names
    assert "License-Expression: MIT" in metadata
    assert "Requires-Python: >=3.11" in metadata

    with tarfile.open(sdist, "r:gz") as archive:
        sdist_names = set(archive.getnames())
    assert any(name.endswith("/src/authlane/py.typed") for name in sdist_names)
    assert any(name.endswith("/src/authlane/_generated/integrations.json") for name in sdist_names)
