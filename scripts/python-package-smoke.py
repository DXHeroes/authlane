from __future__ import annotations

from authlane import AsyncAuthlane, Authlane, AuthlaneError, Result
from authlane.adapters import agno, frameworks, generic, langchain, openai_agents


def main() -> None:
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
