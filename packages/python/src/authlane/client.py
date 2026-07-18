from __future__ import annotations

import inspect
from collections.abc import Callable, Mapping
from typing import Any, Literal, Protocol, TypeVar, cast
from urllib.parse import quote

import httpx

from ._errors import (
    DOCS,
    adapter_error,
    invalid_response,
    network_error,
    timeout_error,
    validation_error,
)
from .models import (
    ApiKeyCredentialLease,
    AuthlaneError,
    Capabilities,
    CapabilityService,
    Connection,
    ConnectSession,
    CredentialLease,
    CredentialPlacement,
    HeaderPlacement,
    OAuthCredentialLease,
    QueryPlacement,
    Result,
    Service,
    ToolDefinition,
    ToolsResponse,
)

T = TypeVar("T")
ToolSet = TypeVar("ToolSet", covariant=True)
ToolFormat = Literal["mcp", "openai"]


class ToolAdapter(Protocol[ToolSet]):
    def build_sync(
        self,
        *,
        external_user_id: str,
        tools: tuple[ToolDefinition, ...],
        lease: Callable[[str], Result[CredentialLease]],
    ) -> ToolSet: ...

    def build_async(
        self,
        *,
        external_user_id: str,
        tools: tuple[ToolDefinition, ...],
        lease: Callable[[str], Any],
    ) -> ToolSet: ...


def _valid_external_user_id(value: str) -> bool:
    return bool(value and value.strip() and len(value) <= 255)


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError("expected object")
    return value


def _required_string(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("expected string")
    return value


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    return _required_string(value)


def _required_bool(value: Any) -> bool:
    if not isinstance(value, bool):
        raise ValueError("expected boolean")
    return value


def _parse_service(value: Any) -> Service:
    item = _as_mapping(value)
    config = _as_mapping(item.get("config", {}))
    return Service(
        id=_required_string(item.get("id")),
        name=_required_string(item.get("name")),
        auth_type=_required_string(item.get("authType")),
        enabled=_required_bool(item.get("enabled")),
        config=dict(config),
    )


def _parse_connection(value: Any) -> Connection:
    item = _as_mapping(value)
    status = _required_string(item.get("status"))
    if status not in {"disconnected", "pending", "connected", "expired", "error"}:
        raise ValueError("invalid status")
    return Connection(
        service_id=_required_string(item.get("serviceId")),
        status=cast(Any, status),
        connected=_required_bool(item.get("connected")),
        expires_at=_optional_string(item.get("expiresAt")),
        connected_at=_optional_string(item.get("connectedAt")),
        last_checked_at=_optional_string(item.get("lastCheckedAt")),
        error_code=_optional_string(item.get("errorCode")),
    )


def _parse_tool(value: Any, service_id: str | None = None) -> ToolDefinition:
    item = _as_mapping(value)
    schema = item.get("inputSchema", item.get("parameters"))
    return ToolDefinition(
        name=_required_string(item.get("name")),
        description=_required_string(item.get("description")),
        input_schema=dict(_as_mapping(schema)),
        service_id=service_id,
    )


def _parse_capabilities(value: Any) -> Capabilities:
    item = _as_mapping(value)
    tool_format = _required_string(item.get("format"))
    if tool_format not in {"mcp", "openai"}:
        raise ValueError("invalid tool format")
    services_value = item.get("services")
    if not isinstance(services_value, list):
        raise ValueError("expected services")
    services: list[CapabilityService] = []
    for raw_service in services_value:
        service = _as_mapping(raw_service)
        service_id = _required_string(service.get("serviceId"))
        raw_tools = service.get("tools")
        if not isinstance(raw_tools, list):
            raise ValueError("expected tools")
        status = _required_string(service.get("status"))
        if status not in {"disconnected", "pending", "connected", "expired", "error"}:
            raise ValueError("invalid status")
        services.append(
            CapabilityService(
                service_id=service_id,
                status=cast(Any, status),
                connected=_required_bool(service.get("connected")),
                expires_at=_optional_string(service.get("expiresAt")),
                tools=tuple(_parse_tool(tool, service_id) for tool in raw_tools),
            )
        )
    return Capabilities(
        external_user_id=_required_string(item.get("externalUserId")),
        format=cast(Any, tool_format),
        version=_required_string(item.get("version")),
        services=tuple(services),
    )


def _parse_tools(value: Any, tool_format: ToolFormat) -> ToolsResponse:
    item = _as_mapping(value)
    key = "tools" if tool_format == "mcp" else "functions"
    values = item.get(key)
    if not isinstance(values, list):
        raise ValueError("expected tool list")
    return ToolsResponse(
        tools=tuple(_parse_tool(tool) for tool in values),
        version=_required_string(item.get("version")),
        format=tool_format,
    )


def _parse_connect_session(value: Any) -> ConnectSession:
    item = _as_mapping(value)
    return ConnectSession(
        id=_required_string(item.get("id")),
        token=_required_string(item.get("token")),
        url=_required_string(item.get("url")),
        expires_at=_required_string(item.get("expiresAt")),
    )


def _parse_lease(value: Any) -> CredentialLease:
    item = _as_mapping(value)
    forbidden = {"refreshToken", "refresh_token", "idToken", "id_token"}
    if forbidden.intersection(item):
        raise ValueError("forbidden credential material")
    lease_type = item.get("type")
    if lease_type == "oauth2":
        scopes = item.get("scopes")
        if not isinstance(scopes, list) or not all(isinstance(scope, str) for scope in scopes):
            raise ValueError("invalid scopes")
        return OAuthCredentialLease(
            type="oauth2",
            lease_id=_required_string(item.get("leaseId")),
            access_token=_required_string(item.get("accessToken")),
            token_type=_required_string(item.get("tokenType")),
            scopes=tuple(scopes),
            expires_at=_optional_string(item.get("expiresAt")),
        )
    if lease_type == "api_key":
        placement_value = _as_mapping(item.get("placement"))
        placement_type = placement_value.get("type")
        if placement_type == "header":
            placement: CredentialPlacement = HeaderPlacement(
                type="header",
                name=_required_string(placement_value.get("name")),
                prefix=_optional_string(placement_value.get("prefix")),
            )
        elif placement_type == "query":
            placement = QueryPlacement(
                type="query", name=_required_string(placement_value.get("name"))
            )
        else:
            raise ValueError("invalid placement")
        return ApiKeyCredentialLease(
            type="api_key",
            lease_id=_required_string(item.get("leaseId")),
            value=_required_string(item.get("value")),
            placement=placement,
            expires_at=_optional_string(item.get("expiresAt")),
        )
    raise ValueError("invalid credential lease")


def _server_error(value: Any) -> AuthlaneError:
    item = value if isinstance(value, Mapping) else {}
    raw_code = item.get("code")
    code = raw_code if isinstance(raw_code, str) else "API_ERROR"
    raw_message = item.get("message")
    message = raw_message if isinstance(raw_message, str) else "Authlane request failed."
    raw_hint = item.get("hint")
    hint = raw_hint if isinstance(raw_hint, str) else "Check the request and API key."
    raw_doc_url = item.get("docUrl")
    doc_url = raw_doc_url if isinstance(raw_doc_url, str) else DOCS
    return AuthlaneError(message=message, code=code, hint=hint, doc_url=doc_url)


class _SyncTransport:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout: float,
        transport: httpx.BaseTransport | None,
        http_client: httpx.Client | None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(timeout=timeout, transport=transport)

    @property
    def is_closed(self) -> bool:
        return self._client.is_closed

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def request(self, method: str, path: str, body: Mapping[str, Any] | None = None) -> Result[Any]:
        try:
            response = self._client.request(
                method,
                f"{self._base_url}{path}",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            payload = _as_mapping(response.json())
            if not response.is_success or payload.get("error") is not None:
                return Result.failure(_server_error(payload.get("error")))
            if "data" not in payload or payload["data"] is None:
                return Result.failure(invalid_response())
            return Result.success(payload["data"])
        except httpx.TimeoutException:
            return Result.failure(timeout_error())
        except httpx.RequestError:
            return Result.failure(network_error())
        except Exception:
            return Result.failure(invalid_response())


class _AsyncTransport:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None,
        http_client: httpx.AsyncClient | None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=timeout, transport=transport)

    @property
    def is_closed(self) -> bool:
        return self._client.is_closed

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def request(
        self, method: str, path: str, body: Mapping[str, Any] | None = None
    ) -> Result[Any]:
        try:
            response = await self._client.request(
                method,
                f"{self._base_url}{path}",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            payload = _as_mapping(response.json())
            if not response.is_success or payload.get("error") is not None:
                return Result.failure(_server_error(payload.get("error")))
            if "data" not in payload or payload["data"] is None:
                return Result.failure(invalid_response())
            return Result.success(payload["data"])
        except httpx.TimeoutException:
            return Result.failure(timeout_error())
        except httpx.RequestError:
            return Result.failure(network_error())
        except Exception:
            return Result.failure(invalid_response())


def _convert(result: Result[Any], parser: Callable[[Any], T]) -> Result[T]:
    if result.error is not None:
        return Result.failure(result.error)
    try:
        return Result.success(parser(result.data))
    except Exception:
        return Result.failure(invalid_response())


class ServicesResource:
    def __init__(self, transport: _SyncTransport) -> None:
        self._transport = transport

    def list(self) -> Result[list[Service]]:
        return _convert(
            self._transport.request("GET", "/api/v1/catalog/services"),
            lambda value: [_parse_service(item) for item in cast(list[Any], value)],
        )


class ConnectionsResource:
    def __init__(self, transport: _SyncTransport) -> None:
        self._transport = transport

    def list(self, *, external_user_id: str) -> Result[list[Connection]]:
        if not _valid_external_user_id(external_user_id):
            return Result.failure(validation_error("Invalid external user ID."))
        path = f"/api/v1/users/{quote(external_user_id, safe='')}/connections"
        return _convert(
            self._transport.request("GET", path),
            lambda value: [_parse_connection(item) for item in cast(list[Any], value)],
        )

    def get(self, *, external_user_id: str, service_id: str) -> Result[Connection]:
        listed = self.list(external_user_id=external_user_id)
        if listed.error is not None:
            return Result.failure(listed.error)
        connection = next(
            (item for item in listed.data or [] if item.service_id == service_id), None
        )
        if connection is None:
            return Result.failure(
                AuthlaneError(
                    "Connection not found.", "NOT_FOUND", "Connect the service first.", DOCS
                )
            )
        return Result.success(connection)


class CapabilitiesResource:
    def __init__(self, transport: _SyncTransport) -> None:
        self._transport = transport

    def get(self, *, external_user_id: str, format: ToolFormat = "mcp") -> Result[Capabilities]:
        if not _valid_external_user_id(external_user_id):
            return Result.failure(validation_error("Invalid external user ID."))
        path = f"/api/v1/users/{quote(external_user_id, safe='')}/capabilities?format={format}"
        return _convert(self._transport.request("GET", path), _parse_capabilities)


class CredentialLeasesResource:
    def __init__(self, transport: _SyncTransport) -> None:
        self._transport = transport

    def create(self, *, external_user_id: str, service_id: str) -> Result[CredentialLease]:
        if not _valid_external_user_id(external_user_id) or not service_id:
            return Result.failure(validation_error())
        path = f"/api/v1/users/{quote(external_user_id, safe='')}/connections/{quote(service_id, safe='')}/credential-leases"
        return _convert(self._transport.request("POST", path), _parse_lease)


class ConnectSessionsResource:
    def __init__(self, transport: _SyncTransport) -> None:
        self._transport = transport

    def create(
        self,
        *,
        external_user_id: str,
        allowed_services: list[str],
        allowed_origin: str,
        expires_in_seconds: int | None = None,
        reauthenticated_at: str | None = None,
    ) -> Result[ConnectSession]:
        if not _valid_external_user_id(external_user_id) or not allowed_origin:
            return Result.failure(validation_error())
        body: dict[str, Any] = {
            "externalUserId": external_user_id,
            "allowedServices": allowed_services,
            "allowedOrigin": allowed_origin,
        }
        if expires_in_seconds is not None:
            body["expiresInSeconds"] = expires_in_seconds
        if reauthenticated_at is not None:
            body["reauthenticatedAt"] = reauthenticated_at
        return _convert(
            self._transport.request("POST", "/api/v1/connect-sessions", body),
            _parse_connect_session,
        )


class ToolsResource:
    def __init__(self, transport: _SyncTransport) -> None:
        self._transport = transport

    def list(self, *, external_user_id: str, format: ToolFormat = "mcp") -> Result[ToolsResponse]:
        if not _valid_external_user_id(external_user_id):
            return Result.failure(validation_error("Invalid external user ID."))
        path = f"/api/v1/users/{quote(external_user_id, safe='')}/tools?format={format}"
        return _convert(
            self._transport.request("GET", path), lambda value: _parse_tools(value, format)
        )


class UserToolsResource:
    def __init__(self, external_user_id: str, client: Authlane) -> None:
        self._external_user_id = external_user_id
        self._client = client

    def list(
        self, *, adapter: ToolAdapter[ToolSet] | None = None, format: ToolFormat = "mcp"
    ) -> Result[ToolSet] | Result[ToolsResponse]:
        if adapter is None:
            return self._client.tools.list(external_user_id=self._external_user_id, format=format)
        capabilities = self._client.capabilities.get(
            external_user_id=self._external_user_id, format="mcp"
        )
        if capabilities.error is not None:
            return Result.failure(capabilities.error)
        assert capabilities.data is not None
        if capabilities.data.external_user_id != self._external_user_id:
            return Result.failure(invalid_response())
        tools = tuple(
            tool
            for service in capabilities.data.services
            if service.connected
            for tool in service.tools
        )
        try:
            lease_attempted = False
            building = True

            def guarded_lease(service_id: str) -> Result[CredentialLease]:
                nonlocal lease_attempted
                if building:
                    lease_attempted = True
                    return Result.failure(adapter_error())
                return self._client.credential_leases.create(
                    external_user_id=self._external_user_id,
                    service_id=service_id,
                )

            built = adapter.build_sync(
                external_user_id=self._external_user_id,
                tools=tools,
                lease=guarded_lease,
            )
            building = False
            if lease_attempted:
                return Result.failure(adapter_error())
            return Result.success(built)
        except Exception:
            return Result.failure(adapter_error())


class UserScope:
    def __init__(self, external_user_id: str, client: Authlane) -> None:
        self.connections = _BoundConnections(external_user_id, client.connections)
        self.capabilities = _BoundCapabilities(external_user_id, client.capabilities)
        self.credential_leases = _BoundCredentialLeases(external_user_id, client.credential_leases)
        self.tools = UserToolsResource(external_user_id, client)


class _BoundConnections:
    def __init__(self, external_user_id: str, resource: ConnectionsResource) -> None:
        self._id, self._resource = external_user_id, resource

    def list(self) -> Result[list[Connection]]:
        return self._resource.list(external_user_id=self._id)

    def get(self, service_id: str) -> Result[Connection]:
        return self._resource.get(external_user_id=self._id, service_id=service_id)


class _BoundCapabilities:
    def __init__(self, external_user_id: str, resource: CapabilitiesResource) -> None:
        self._id, self._resource = external_user_id, resource

    def get(self, *, format: ToolFormat = "mcp") -> Result[Capabilities]:
        return self._resource.get(external_user_id=self._id, format=format)


class _BoundCredentialLeases:
    def __init__(self, external_user_id: str, resource: CredentialLeasesResource) -> None:
        self._id, self._resource = external_user_id, resource

    def create(self, *, service_id: str) -> Result[CredentialLease]:
        return self._resource.create(external_user_id=self._id, service_id=service_id)


class Authlane:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://app.authlane.io",
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._transport = _SyncTransport(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            transport=transport,
            http_client=http_client,
        )
        self.services = ServicesResource(self._transport)
        self.connections = ConnectionsResource(self._transport)
        self.capabilities = CapabilitiesResource(self._transport)
        self.credential_leases = CredentialLeasesResource(self._transport)
        self.connect_sessions = ConnectSessionsResource(self._transport)
        self.tools = ToolsResource(self._transport)

    @property
    def is_closed(self) -> bool:
        return self._transport.is_closed

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> Authlane:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def user(self, external_user_id: str) -> UserScope:
        return UserScope(external_user_id, self)


# Async resources deliberately mirror the sync API so framework choice does not change scoping.
class AsyncServicesResource:
    def __init__(self, transport: _AsyncTransport) -> None:
        self._transport = transport

    async def list(self) -> Result[list[Service]]:
        return _convert(
            await self._transport.request("GET", "/api/v1/catalog/services"),
            lambda value: [_parse_service(item) for item in cast(list[Any], value)],
        )


class AsyncConnectionsResource:
    def __init__(self, transport: _AsyncTransport) -> None:
        self._transport = transport

    async def list(self, *, external_user_id: str) -> Result[list[Connection]]:
        if not _valid_external_user_id(external_user_id):
            return Result.failure(validation_error("Invalid external user ID."))
        return _convert(
            await self._transport.request(
                "GET", f"/api/v1/users/{quote(external_user_id, safe='')}/connections"
            ),
            lambda value: [_parse_connection(item) for item in cast(list[Any], value)],
        )

    async def get(self, *, external_user_id: str, service_id: str) -> Result[Connection]:
        listed = await self.list(external_user_id=external_user_id)
        if listed.error is not None:
            return Result.failure(listed.error)
        connection = next(
            (item for item in listed.data or [] if item.service_id == service_id), None
        )
        if connection is None:
            return Result.failure(
                AuthlaneError(
                    "Connection not found.", "NOT_FOUND", "Connect the service first.", DOCS
                )
            )
        return Result.success(connection)


class AsyncCapabilitiesResource:
    def __init__(self, transport: _AsyncTransport) -> None:
        self._transport = transport

    async def get(
        self, *, external_user_id: str, format: ToolFormat = "mcp"
    ) -> Result[Capabilities]:
        if not _valid_external_user_id(external_user_id):
            return Result.failure(validation_error("Invalid external user ID."))
        return _convert(
            await self._transport.request(
                "GET",
                f"/api/v1/users/{quote(external_user_id, safe='')}/capabilities?format={format}",
            ),
            _parse_capabilities,
        )


class AsyncCredentialLeasesResource:
    def __init__(self, transport: _AsyncTransport) -> None:
        self._transport = transport

    async def create(self, *, external_user_id: str, service_id: str) -> Result[CredentialLease]:
        if not _valid_external_user_id(external_user_id) or not service_id:
            return Result.failure(validation_error())
        return _convert(
            await self._transport.request(
                "POST",
                f"/api/v1/users/{quote(external_user_id, safe='')}/connections/{quote(service_id, safe='')}/credential-leases",
            ),
            _parse_lease,
        )


class AsyncToolsResource:
    def __init__(self, transport: _AsyncTransport) -> None:
        self._transport = transport

    async def list(
        self, *, external_user_id: str, format: ToolFormat = "mcp"
    ) -> Result[ToolsResponse]:
        if not _valid_external_user_id(external_user_id):
            return Result.failure(validation_error("Invalid external user ID."))
        return _convert(
            await self._transport.request(
                "GET", f"/api/v1/users/{quote(external_user_id, safe='')}/tools?format={format}"
            ),
            lambda value: _parse_tools(value, format),
        )


class AsyncConnectSessionsResource:
    def __init__(self, transport: _AsyncTransport) -> None:
        self._transport = transport

    async def create(
        self,
        *,
        external_user_id: str,
        allowed_services: list[str],
        allowed_origin: str,
        expires_in_seconds: int | None = None,
        reauthenticated_at: str | None = None,
    ) -> Result[ConnectSession]:
        if not _valid_external_user_id(external_user_id) or not allowed_origin:
            return Result.failure(validation_error())
        body: dict[str, Any] = {
            "externalUserId": external_user_id,
            "allowedServices": allowed_services,
            "allowedOrigin": allowed_origin,
        }
        if expires_in_seconds is not None:
            body["expiresInSeconds"] = expires_in_seconds
        if reauthenticated_at is not None:
            body["reauthenticatedAt"] = reauthenticated_at
        return _convert(
            await self._transport.request("POST", "/api/v1/connect-sessions", body),
            _parse_connect_session,
        )


class AsyncUserToolsResource:
    def __init__(self, external_user_id: str, client: AsyncAuthlane) -> None:
        self._external_user_id, self._client = external_user_id, client

    async def list(
        self, *, adapter: ToolAdapter[ToolSet] | None = None, format: ToolFormat = "mcp"
    ) -> Result[ToolSet] | Result[ToolsResponse]:
        if adapter is None:
            return await self._client.tools.list(
                external_user_id=self._external_user_id, format=format
            )
        capabilities = await self._client.capabilities.get(
            external_user_id=self._external_user_id, format="mcp"
        )
        if capabilities.error is not None:
            return Result.failure(capabilities.error)
        assert capabilities.data is not None
        if capabilities.data.external_user_id != self._external_user_id:
            return Result.failure(invalid_response())
        tools = tuple(
            tool
            for service in capabilities.data.services
            if service.connected
            for tool in service.tools
        )
        try:
            lease_attempted = False
            building = True

            class BlockedLease:
                def __await__(self) -> Any:
                    async def result() -> Result[CredentialLease]:
                        return Result.failure(adapter_error())

                    return result().__await__()

            def guarded_lease(service_id: str) -> Any:
                nonlocal lease_attempted
                if building:
                    lease_attempted = True
                    return BlockedLease()
                return self._client.credential_leases.create(
                    external_user_id=self._external_user_id,
                    service_id=service_id,
                )

            build_result = adapter.build_async(
                external_user_id=self._external_user_id,
                tools=tools,
                lease=guarded_lease,
            )
            built = await build_result if inspect.isawaitable(build_result) else build_result
            building = False
            if lease_attempted:
                return Result.failure(adapter_error())
            return Result.success(built)
        except Exception:
            return Result.failure(adapter_error())


class AsyncUserScope:
    def __init__(self, external_user_id: str, client: AsyncAuthlane) -> None:
        self.connections = _AsyncBoundConnections(external_user_id, client.connections)
        self.capabilities = _AsyncBoundCapabilities(external_user_id, client.capabilities)
        self.credential_leases = _AsyncBoundCredentialLeases(
            external_user_id, client.credential_leases
        )
        self.tools = AsyncUserToolsResource(external_user_id, client)


class _AsyncBoundConnections:
    def __init__(self, external_user_id: str, resource: AsyncConnectionsResource) -> None:
        self._id, self._resource = external_user_id, resource

    async def list(self) -> Result[list[Connection]]:
        return await self._resource.list(external_user_id=self._id)

    async def get(self, service_id: str) -> Result[Connection]:
        return await self._resource.get(external_user_id=self._id, service_id=service_id)


class _AsyncBoundCapabilities:
    def __init__(self, external_user_id: str, resource: AsyncCapabilitiesResource) -> None:
        self._id, self._resource = external_user_id, resource

    async def get(self, *, format: ToolFormat = "mcp") -> Result[Capabilities]:
        return await self._resource.get(external_user_id=self._id, format=format)


class _AsyncBoundCredentialLeases:
    def __init__(self, external_user_id: str, resource: AsyncCredentialLeasesResource) -> None:
        self._id, self._resource = external_user_id, resource

    async def create(self, *, service_id: str) -> Result[CredentialLease]:
        return await self._resource.create(external_user_id=self._id, service_id=service_id)


class AsyncAuthlane:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://app.authlane.io",
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._transport = _AsyncTransport(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            transport=transport,
            http_client=http_client,
        )
        self.services = AsyncServicesResource(self._transport)
        self.connections = AsyncConnectionsResource(self._transport)
        self.capabilities = AsyncCapabilitiesResource(self._transport)
        self.credential_leases = AsyncCredentialLeasesResource(self._transport)
        self.connect_sessions = AsyncConnectSessionsResource(self._transport)
        self.tools = AsyncToolsResource(self._transport)

    @property
    def is_closed(self) -> bool:
        return self._transport.is_closed

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> AsyncAuthlane:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    def user(self, external_user_id: str) -> AsyncUserScope:
        return AsyncUserScope(external_user_id, self)
