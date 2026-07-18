from __future__ import annotations

import sys
from pathlib import Path

import authlane
from authlane import AsyncAuthlane, Authlane, AuthlaneError, Result
from authlane.adapters import agno, frameworks, generic, langchain, openai_agents


def main() -> None:
    installed_module = Path(authlane.__file__).resolve()
    environment = Path(sys.prefix).resolve()
    assert installed_module.is_relative_to(environment), (
        f"authlane imported from {installed_module}, outside isolated environment {environment}"
    )
    assert Authlane.__name__ == "Authlane"
    assert AsyncAuthlane.__name__ == "AsyncAuthlane"
    assert AuthlaneError.__name__ == "AuthlaneError"
    assert Result.__name__ == "Result"
    assert all(
        module is not None
        for module in (agno, frameworks, generic, langchain, openai_agents)
    )


if __name__ == "__main__":
    main()
