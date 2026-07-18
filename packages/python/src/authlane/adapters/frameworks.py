from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from ..models import CredentialLease, Result, ToolDefinition
from .generic import AsyncGenericTool, GenericAdapter, GenericTool


def _value(result: Result[Any]) -> Any:
    if result.error is not None:
        return {"error": {"code": result.error.code, "message": result.error.message}}
    return result.data


class FrameworkAdapter:
    def __init__(
        self,
        framework: str,
        *,
        provider_transport: httpx.BaseTransport | None = None,
        async_provider_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.framework = framework
        self._generic = GenericAdapter(
            provider_transport=provider_transport,
            async_provider_transport=async_provider_transport,
        )

    def build_sync(
        self,
        *,
        external_user_id: str,
        tools: tuple[ToolDefinition, ...],
        lease: Callable[[str], Result[CredentialLease]],
    ) -> list[Any]:
        generic_tools = self._generic.build_sync(
            external_user_id=external_user_id, tools=tools, lease=lease
        )
        return [self._convert_sync(tool) for tool in generic_tools.values()]

    def build_async(
        self,
        *,
        external_user_id: str,
        tools: tuple[ToolDefinition, ...],
        lease: Callable[[str], Awaitable[Result[CredentialLease]]],
    ) -> list[Any]:
        generic_tools = self._generic.build_async(
            external_user_id=external_user_id, tools=tools, lease=lease
        )
        return [self._convert_async(tool) for tool in generic_tools.values()]

    def _convert_sync(self, tool: GenericTool) -> Any:
        def invoke(**kwargs: Any) -> Any:
            return _value(tool.invoke(kwargs))

        invoke.__name__ = tool.name
        invoke.__doc__ = tool.description
        if self.framework == "agno":
            from agno.tools import Function

            return Function(
                name=tool.name,
                description=tool.description,
                parameters=tool.input_schema,
                entrypoint=invoke,
            )
        if self.framework == "langchain":
            from langchain_core.tools import StructuredTool

            return StructuredTool.from_function(
                func=invoke,
                name=tool.name,
                description=tool.description,
                args_schema=tool.input_schema,
                infer_schema=False,
            )
        from agents import FunctionTool

        async def on_invoke_tool(_context: Any, arguments: str) -> str:
            return json.dumps(_value(tool.invoke(json.loads(arguments))))

        return FunctionTool(
            name=tool.name,
            description=tool.description,
            params_json_schema=tool.input_schema,
            on_invoke_tool=on_invoke_tool,
        )

    def _convert_async(self, tool: AsyncGenericTool) -> Any:
        async def invoke(**kwargs: Any) -> Any:
            return _value(await tool.ainvoke(kwargs))

        invoke.__name__ = tool.name
        invoke.__doc__ = tool.description
        if self.framework == "agno":
            from agno.tools import Function

            return Function(
                name=tool.name,
                description=tool.description,
                parameters=tool.input_schema,
                entrypoint=invoke,
            )
        if self.framework == "langchain":
            from langchain_core.tools import StructuredTool

            return StructuredTool.from_function(
                coroutine=invoke,
                name=tool.name,
                description=tool.description,
                args_schema=tool.input_schema,
                infer_schema=False,
            )
        from agents import FunctionTool

        async def on_invoke_tool(_context: Any, arguments: str) -> str:
            return json.dumps(_value(await tool.ainvoke(json.loads(arguments))))

        return FunctionTool(
            name=tool.name,
            description=tool.description,
            params_json_schema=tool.input_schema,
            on_invoke_tool=on_invoke_tool,
        )


def agno(
    *,
    provider_transport: httpx.BaseTransport | None = None,
    async_provider_transport: httpx.AsyncBaseTransport | None = None,
) -> FrameworkAdapter:
    return FrameworkAdapter(
        "agno",
        provider_transport=provider_transport,
        async_provider_transport=async_provider_transport,
    )


def langchain(
    *,
    provider_transport: httpx.BaseTransport | None = None,
    async_provider_transport: httpx.AsyncBaseTransport | None = None,
) -> FrameworkAdapter:
    return FrameworkAdapter(
        "langchain",
        provider_transport=provider_transport,
        async_provider_transport=async_provider_transport,
    )


def openai_agents(
    *,
    provider_transport: httpx.BaseTransport | None = None,
    async_provider_transport: httpx.AsyncBaseTransport | None = None,
) -> FrameworkAdapter:
    return FrameworkAdapter(
        "openai-agents",
        provider_transport=provider_transport,
        async_provider_transport=async_provider_transport,
    )
