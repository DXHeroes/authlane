# Python SDK

Use Authlane from Python with non-throwing results and user-scoped tools

Install the Python client in the trusted runtime that owns your agent or backend:

```bash
pip install authlane
```

## Initialize the client

```python
import os

from authlane import Authlane

with Authlane(
    api_key=os.environ["AUTHLANE_API_KEY"],
    base_url="https://app.authlane.io",
) as authlane:
    result = authlane.services.list()

if result.error:
    print(result.error.message)
else:
    print(result.data)
```

Every public SDK call returns a `Result` with `data` and `error`. Expected API failures do not
raise exceptions, so your application can handle the same stable error envelope in TypeScript and
Python.

## Connect an external user

```python
session = authlane.connect_sessions.create(
    external_user_id="user_123",
    allowed_services=[],
    allowed_origin="https://app.example.com",
)
```

`allowed_services=[]` snapshots every service currently enabled for the tenant. Pass explicit
service IDs to limit the session. Duplicates are accepted and deduplicated by the server.

## Load user-scoped tools

```python
from authlane.adapters import generic

with Authlane(api_key=os.environ["AUTHLANE_API_KEY"]) as authlane:
    result = authlane.user("user_123").tools.list(adapter=generic())

if result.error:
    raise RuntimeError(result.error.message)

tools = result.data
```

The adapter executes in your runtime. It requests access-only material when a selected tool runs,
then calls the provider directly. Tool inputs and provider responses never pass through Authlane.

## Async applications

```python
from authlane import AsyncAuthlane
from authlane.adapters import langchain

async with AsyncAuthlane(api_key=os.environ["AUTHLANE_API_KEY"]) as authlane:
    result = await authlane.user("user_123").tools.list(adapter=langchain())
```

See [Framework adapters](/docs/sdk/frameworks) for Agno, LangChain, OpenAI Agents, Vercel AI,
Mastra, and local MCP examples.
