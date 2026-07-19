# LangChain

Build a LangChain agent with Authlane tools scoped to one authenticated SaaS user.

The Python adapter returns LangChain `StructuredTool` instances with canonical input schemas.

## Prerequisites

```bash
pip install 'authlane[langchain]' langchain
```

## Implement the workflow

```python
import os
from dataclasses import dataclass

from authlane import Authlane
from authlane.adapters import langchain
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel

@dataclass(frozen=True)
class CurrentUser:
    id: str

def answer(current_user: CurrentUser, prompt: str, model: BaseChatModel):
    with Authlane(
        api_key=os.environ["AUTHLANE_API_KEY"],
        base_url="https://app.authlane.io",
    ) as authlane:
        user = authlane.user(current_user.id)
        result = user.tools.list(adapter=langchain())
        if result.error is not None:
            return result
        assert result.data is not None
        agent = create_agent(model=model, tools=result.data)
        return agent.invoke({"messages": [{"role": "user", "content": prompt}]})
```

## Expected result

The agent receives one user-bound list of `StructuredTool` objects.

## Handle errors

Branch on the Authlane `Result` before creating the agent. Treat model and framework exceptions as
separate application errors.

## Security boundary

Never share the tool list across user requests. Tool callbacks acquire fresh access-only material
and call the provider from this Python process.

## Next step

Use [troubleshooting](/docs/guides/troubleshooting) for tuple error recovery.
