from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from .._errors import credential_lease_error, invalid_tool_input
from ..executors import aexecute, execute, validate_arguments
from ..models import CredentialLease, Result, ToolDefinition


@dataclass(frozen=True, slots=True)
class GenericTool:
    name: str
    description: str
    input_schema: dict[str, Any]
    external_user_id: str
    service_id: str
    _lease: Callable[[str], Result[CredentialLease]]
    _transport: httpx.BaseTransport | None

    def invoke(self, arguments: Mapping[str, Any]) -> Result[Any]:
        if not validate_arguments(self.service_id, self.name, arguments):
            return Result.failure(invalid_tool_input())
        lease = self._lease(self.service_id)
        if lease.error is not None:
            return Result.failure(credential_lease_error())
        assert lease.data is not None
        return execute(
            service_id=self.service_id,
            tool_name=self.name,
            arguments=arguments,
            credential=lease.data,
            transport=self._transport,
        )


@dataclass(frozen=True, slots=True)
class AsyncGenericTool:
    name: str
    description: str
    input_schema: dict[str, Any]
    external_user_id: str
    service_id: str
    _lease: Callable[[str], Awaitable[Result[CredentialLease]]]
    _transport: httpx.AsyncBaseTransport | None

    async def ainvoke(self, arguments: Mapping[str, Any]) -> Result[Any]:
        if not validate_arguments(self.service_id, self.name, arguments):
            return Result.failure(invalid_tool_input())
        lease = await self._lease(self.service_id)
        if lease.error is not None:
            return Result.failure(credential_lease_error())
        assert lease.data is not None
        return await aexecute(
            service_id=self.service_id,
            tool_name=self.name,
            arguments=arguments,
            credential=lease.data,
            transport=self._transport,
        )


class GenericAdapter:
    framework = "generic"

    def __init__(
        self,
        *,
        provider_transport: httpx.BaseTransport | None = None,
        async_provider_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.provider_transport = provider_transport
        self.async_provider_transport = async_provider_transport

    def build_sync(
        self,
        *,
        external_user_id: str,
        tools: tuple[ToolDefinition, ...],
        lease: Callable[[str], Result[CredentialLease]],
    ) -> dict[str, GenericTool]:
        return {
            tool.name: GenericTool(
                tool.name,
                tool.description,
                tool.input_schema,
                external_user_id,
                tool.service_id or "",
                lease,
                self.provider_transport,
            )
            for tool in tools
        }

    def build_async(
        self,
        *,
        external_user_id: str,
        tools: tuple[ToolDefinition, ...],
        lease: Callable[[str], Awaitable[Result[CredentialLease]]],
    ) -> dict[str, AsyncGenericTool]:
        return {
            tool.name: AsyncGenericTool(
                tool.name,
                tool.description,
                tool.input_schema,
                external_user_id,
                tool.service_id or "",
                lease,
                self.async_provider_transport,
            )
            for tool in tools
        }


def generic(
    *,
    provider_transport: httpx.BaseTransport | None = None,
    async_provider_transport: httpx.AsyncBaseTransport | None = None,
) -> GenericAdapter:
    return GenericAdapter(
        provider_transport=provider_transport, async_provider_transport=async_provider_transport
    )
