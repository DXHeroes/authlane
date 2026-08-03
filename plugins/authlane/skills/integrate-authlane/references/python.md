# Python integration

## Install and initialize

Use Python 3.11+ in a trusted backend or agent runtime:

```bash
pip install authlane
pip install 'authlane[agno]'       # choose only required adapters
pip install 'authlane[langchain]'
pip install 'authlane[openai-agents]'
```

```python
import os
from authlane import Authlane

authlane = Authlane(
    api_key=os.environ["AUTHLANE_TOOLS_KEY"],
)
```

Use separate client instances/keys for catalog, connect, and tools. Public methods return a
non-throwing `Result` with `data` and `error`; redact the error before returning it to a browser or
model.

## Catalog and connect

```python
current_user = require_user(request)
catalog = catalog_authlane.services.list()
status = catalog_authlane.user(current_user.id).capabilities.get(format="mcp")
session = connect_authlane.connect_sessions.create(
    external_user_id=current_user.id,
    allowed_services=[],
    allowed_origin=DEPLOYMENT_ORIGINS["production"],
)
```

Return only safe catalog/status data or `session.data.url`. Do not accept the user ID or origin from
request JSON.

## Local tools and frameworks

```python
from authlane.adapters import generic

current_user = require_user(request)
listed = tools_authlane.user(current_user.id).tools.list(adapter=generic())
if listed.error:
    return safe_sdk_error(listed.error)

result = listed.data["github_create_issue"].invoke(arguments)
```

Framework-native adapters use the same user-bound call:

```python
from authlane.adapters import agno, langchain, openai_agents

agno_tools = tools_authlane.user(current_user.id).tools.list(adapter=agno())
langchain_tools = tools_authlane.user(current_user.id).tools.list(adapter=langchain())
openai_tools = tools_authlane.user(current_user.id).tools.list(adapter=openai_agents())
```

Use `AsyncAuthlane` and await the same resources in async applications. Generic tools provide
`ainvoke`; framework adapters expose their native async callback.

Build tools per request/user. Listing obtains definitions only. Each invocation obtains a fresh
access-only lease and calls the provider from this Python process. Do not cache tools or credentials,
and do not route provider traffic through Authlane.
