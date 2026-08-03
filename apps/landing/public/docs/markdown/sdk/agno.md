# Agno

Run an Agno agent with Authlane tools bound to one authenticated external user.

The Python adapter returns Agno `Function` tools without loading credentials during listing.

## Prerequisites

```bash
pip install 'authlane[agno]'
```

## Implement the workflow

```python
import os
from dataclasses import dataclass

from agno.agent import Agent
from authlane import Authlane
from authlane.adapters import agno

@dataclass(frozen=True)
class CurrentUser:
    id: str

def answer(current_user: CurrentUser, prompt: str):
    with Authlane(
        api_key=os.environ["AUTHLANE_API_KEY"],
    ) as authlane:
        user = authlane.user(current_user.id)
        result = user.tools.list(adapter=agno())
        if result.error is not None:
            return result
        assert result.data is not None
        return Agent(tools=result.data).run(prompt)
```

## Expected result

`result.data` is a list of Agno `Function` objects whose entrypoints are bound to this external
user.

## Handle errors

Inspect `result.error.code`, `message`, and `hint`; expected Authlane failures do not raise. Handle
Agno/model exceptions separately.

## Security boundary

Keep the SDK client and tools in the trusted Python runtime. An invoked function gets a fresh lease
and calls the provider directly from Python.

## Next step

Read the complete [Python SDK guide](/docs/sdk/python).
