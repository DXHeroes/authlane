from __future__ import annotations

import importlib
import json
import sys
from typing import Any

import httpx
import pytest

from authlane.adapters import agno, generic, langchain, openai_agents
from authlane.models import OAuthCredentialLease, Result, ToolDefinition


def test_generic_adapter_has_no_framework_dependency() -> None:
    adapter = generic()
    assert adapter.framework == "generic"


def test_optional_framework_modules_import_without_frameworks_installed() -> None:
    blocked = {"agno", "langchain_core", "agents"}
    before = set(sys.modules)

    importlib.import_module("authlane.adapters.agno")
    importlib.import_module("authlane.adapters.langchain")
    importlib.import_module("authlane.adapters.openai_agents")

    imported = set(sys.modules) - before
    assert not (blocked & imported)


def test_framework_factories_are_public_and_lazy() -> None:
    assert agno().framework == "agno"
    assert langchain().framework == "langchain"
    assert openai_agents().framework == "openai-agents"


@pytest.mark.parametrize(
    ("factory", "expected_module", "schema_attribute"),
    [
        (agno, "agno.tools.function", "parameters"),
        (langchain, "langchain_core.tools.structured", "args_schema"),
        (openai_agents, "agents.tool", "params_json_schema"),
    ],
)
def test_installed_framework_adapters_create_native_tools_with_canonical_schema(
    factory: Any, expected_module: str, schema_attribute: str
) -> None:
    pytest.importorskip(expected_module.partition(".")[0])
    requests: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": 42})

    definition = ToolDefinition(
        name="github_create_issue",
        description="Create an issue",
        input_schema={
            "type": "object",
            "properties": {
                "owner": {"type": "string"},
                "repo": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["owner", "repo", "title"],
        },
        service_id="github",
    )

    built = factory(provider_transport=httpx.MockTransport(provider)).build_sync(
        external_user_id="user_123",
        tools=(definition,),
        lease=lambda _: Result.success(
            OAuthCredentialLease(
                type="oauth2",
                lease_id="lease_1",
                access_token="provider-secret",
                token_type="Bearer",
                scopes=(),
                expires_at=None,
            )
        ),
    )

    assert len(built) == 1
    native_tool = built[0]
    assert type(native_tool).__module__ == expected_module
    assert native_tool.name == definition.name
    assert native_tool.description == definition.description
    schema = getattr(native_tool, schema_attribute)
    if expected_module == "agents.tool":
        assert schema["additionalProperties"] is False
        assert {key: value for key, value in schema.items() if key != "additionalProperties"} == (
            definition.input_schema
        )
    else:
        assert schema == definition.input_schema
    assert requests == []
    arguments = {"owner": "dxheroes", "repo": "authlane", "title": "Python SDK"}
    if expected_module == "agno.tools.function":
        assert native_tool.entrypoint(**arguments) == {"id": 42}
    elif expected_module == "langchain_core.tools.structured":
        assert native_tool.invoke(arguments) == {"id": 42}
    if expected_module != "agents.tool":
        assert requests[0].url.host == "api.github.com"


@pytest.mark.anyio
async def test_openai_agents_native_tool_is_executable() -> None:
    pytest.importorskip("agents")
    requests: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": 42})

    definition = ToolDefinition(
        name="github_create_issue",
        description="Create an issue",
        input_schema={
            "type": "object",
            "properties": {
                "owner": {"type": "string"},
                "repo": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["owner", "repo", "title"],
        },
        service_id="github",
    )
    native_tool = openai_agents(provider_transport=httpx.MockTransport(provider)).build_sync(
        external_user_id="user_123",
        tools=(definition,),
        lease=lambda _: Result.success(
            OAuthCredentialLease(
                type="oauth2",
                lease_id="lease_1",
                access_token="provider-secret",
                token_type="Bearer",
                scopes=(),
                expires_at=None,
            )
        ),
    )[0]

    result = await native_tool.on_invoke_tool(
        None,
        json.dumps({"owner": "dxheroes", "repo": "authlane", "title": "Python SDK"}),
    )

    assert json.loads(result) == {"id": 42}
    assert requests[0].url.host == "api.github.com"


@pytest.mark.anyio
@pytest.mark.parametrize("factory", [agno, langchain, openai_agents])
async def test_framework_adapters_support_async_direct_execution(factory: Any) -> None:
    pytest.importorskip(
        {agno: "agno", langchain: "langchain_core", openai_agents: "agents"}[factory]
    )
    requests: list[httpx.Request] = []
    lease_calls: list[str] = []

    async def provider(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": 42})

    async def lease(service_id: str) -> Result[OAuthCredentialLease]:
        lease_calls.append(service_id)
        return Result.success(
            OAuthCredentialLease(
                type="oauth2",
                lease_id="lease_1",
                access_token="provider-secret",
                token_type="Bearer",
                scopes=(),
                expires_at=None,
            )
        )

    definition = ToolDefinition(
        name="github_create_issue",
        description="Create an issue",
        input_schema={
            "type": "object",
            "properties": {
                "owner": {"type": "string"},
                "repo": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["owner", "repo", "title"],
        },
        service_id="github",
    )
    native_tool = factory(async_provider_transport=httpx.MockTransport(provider)).build_async(
        external_user_id="user_123", tools=(definition,), lease=lease
    )[0]
    arguments = {"owner": "dxheroes", "repo": "authlane", "title": "Python SDK"}

    if factory is agno:
        result = await native_tool.entrypoint(**arguments)
    elif factory is langchain:
        result = await native_tool.ainvoke(arguments)
    else:
        result = json.loads(await native_tool.on_invoke_tool(None, json.dumps(arguments)))

    assert result == {"id": 42}
    assert lease_calls == ["github"]
    assert requests[0].url.host == "api.github.com"
