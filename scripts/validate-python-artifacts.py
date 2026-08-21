from __future__ import annotations

import email.parser
import re
import tarfile
import zipfile
from pathlib import Path


DIST = Path(__file__).parents[1] / "packages" / "python" / "dist"
REPOSITORY_ROOT = Path(__file__).parents[1]
FORBIDDEN = re.compile(
    r"(^|/)(tests?|fixtures?|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache)(/|$)|"
    r"(^|/)\.env(?:\.|$)|\.(pem|key|p12|pfx)$",
    re.IGNORECASE,
)


def validate_metadata(metadata: str) -> None:
    message = email.parser.Parser().parsestr(metadata)
    assert message["Name"] == "authlane"
    assert message["Version"]
    assert message["License-Expression"] == "MIT"
    assert message["Requires-Python"] == ">=3.11"
    urls = set(message.get_all("Project-URL", []))
    assert "Homepage, https://authlane.io/docs" in urls
    assert "Documentation, https://authlane.io/docs/sdk/python" in urls
    assert "Repository, https://github.com/DXHeroes/authlane" in urls
    assert "Issues, https://github.com/DXHeroes/authlane/issues" in urls
    dependencies = message.get_all("Requires-Dist", [])
    assert any(
        "httpx<1,>=0.27" in dependency.replace(" ", "") for dependency in dependencies
    )
    assert any(
        "jsonschema<5,>=4.23" in dependency.replace(" ", "")
        for dependency in dependencies
    )


def validate_names(names: set[str]) -> None:
    assert names
    for name in names:
        assert not FORBIDDEN.search(name), f"forbidden artifact member: {name}"


def main() -> None:
    assert (REPOSITORY_ROOT / "LICENSE").read_bytes() == (
        REPOSITORY_ROOT / "packages" / "python" / "LICENSE"
    ).read_bytes()
    wheels = sorted(DIST.glob("authlane-*.whl"))
    sdists = sorted(DIST.glob("authlane-*.tar.gz"))
    assert len(wheels) == 1, f"expected one wheel, got {wheels}"
    assert len(sdists) == 1, f"expected one sdist, got {sdists}"

    with zipfile.ZipFile(wheels[0]) as archive:
        wheel_names = set(archive.namelist())
        validate_names(wheel_names)
        metadata_name = next(
            name for name in wheel_names if name.endswith(".dist-info/METADATA")
        )
        validate_metadata(archive.read(metadata_name).decode())
        assert "authlane/py.typed" in wheel_names
        assert any(name.endswith(".dist-info/licenses/LICENSE") for name in wheel_names)

    with tarfile.open(sdists[0], "r:gz") as archive:
        sdist_names = set(archive.getnames())
        validate_names(sdist_names)
        pkg_info = next(name for name in sdist_names if name.endswith("/PKG-INFO"))
        metadata_file = archive.extractfile(pkg_info)
        assert metadata_file is not None
        validate_metadata(metadata_file.read().decode())
        assert any(name.endswith("/src/authlane/py.typed") for name in sdist_names)
        assert any(name.endswith("/LICENSE") for name in sdist_names)

    print(f"Validated {wheels[0].name} and {sdists[0].name}")


if __name__ == "__main__":
    main()
