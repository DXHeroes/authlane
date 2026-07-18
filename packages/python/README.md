# Authlane Python SDK

Typed, server-only access to user-scoped integration tools. Authlane supplies definitions and a
fresh short-lived, access-only credential lease at invocation time. The tool then calls GitHub,
Slack, Google, or another provider directly from your process—provider traffic never passes
through Authlane.

## Install

Python 3.11+ is supported.

```bash
pip install authlane
```

Framework adapters remain optional:

```bash
pip install 'authlane[agno]'
pip install 'authlane[langchain]'
pip install 'authlane[openai-agents]'
# or all adapters
pip install 'authlane[all]'
```

## First user-scoped tool call

```python
from authlane import Authlane
from authlane.adapters import generic

with Authlane(api_key="ak_...") as authlane:
    listed = authlane.user("user_123").tools.list(adapter=generic())
    if listed.error:
        print(listed.error.code, listed.error.message, listed.error.hint)
    else:
        result = listed.data["github_create_issue"].invoke(
            {"owner": "acme", "repo": "product", "title": "Ship it"}
        )
        if result.error:
            print(result.error.code, result.error.message)
        else:
            print(result.data)
```

Listing tools fetches definitions only. It does not fetch provider credentials. Each `invoke()`
requests its own fresh credential lease and sends the provider request from this Python runtime.
All public operations return `Result[T]`; expected API, validation, network, provider, and adapter
failures do not raise.

## Let an end user connect services

```python
session = authlane.connect_sessions.create(
    external_user_id="user_123",
    allowed_services=["github", "slack"],
    allowed_origin="https://app.example.com",
)

if session.data:
    print(session.data.url)  # open in a redirect, popup, or hosted connect UI
```

`allowed_services=[]` means every service currently enabled for the tenant. Authlane stores a
concrete snapshot for that session, so services enabled later are not silently added.

## Framework-native tools

Use the same user-scoped flow with any adapter:

```python
from authlane.adapters import agno, langchain, openai_agents

agno_tools = authlane.user("user_123").tools.list(adapter=agno())
langchain_tools = authlane.user("user_123").tools.list(adapter=langchain())
openai_tools = authlane.user("user_123").tools.list(adapter=openai_agents())
```

The returned native tool objects preserve the canonical name, description, and JSON Schema. Their
callbacks remain bound to `user_123`; credentials are acquired only when the framework invokes a
tool.

## Async

```python
from authlane import AsyncAuthlane
from authlane.adapters import generic

async with AsyncAuthlane(api_key="ak_...") as authlane:
    listed = await authlane.user("user_123").tools.list(adapter=generic())
    if listed.data:
        result = await listed.data["stripe_get_customer"].ainvoke(
            {"customer_id": "cus_123"}
        )
```

`Authlane` and `AsyncAuthlane` also expose typed `services`, `connections`, `capabilities`,
`credential_leases`, `connect_sessions`, and raw `tools` resources. Keep the API key and all SDK
use on trusted server infrastructure.
