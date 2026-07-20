from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, Literal, TypeVar

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class AuthlaneError:
    message: str
    code: str
    hint: str
    doc_url: str


@dataclass(frozen=True, slots=True)
class Result(Generic[T]):
    data: T | None
    error: AuthlaneError | None

    def __post_init__(self) -> None:
        if (self.data is None) == (self.error is None):
            raise ValueError("Result must contain exactly one of data or error")

    @classmethod
    def success(cls, data: T) -> Result[T]:
        return cls(data=data, error=None)

    @classmethod
    def failure(cls, error: AuthlaneError) -> Result[T]:
        return cls(data=None, error=error)


@dataclass(frozen=True, slots=True)
class Service:
    id: str
    name: str
    auth_type: str
    enabled: bool
    config: dict[str, Any]


ConnectionStatus = Literal["disconnected", "pending", "connected", "expired", "error"]


@dataclass(frozen=True, slots=True)
class Connection:
    service_id: str
    status: ConnectionStatus
    connected: bool
    expires_at: str | None
    connected_at: str | None
    last_checked_at: str | None
    error_code: str | None


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    service_id: str | None = None


@dataclass(frozen=True, slots=True)
class CapabilityService:
    service_id: str
    status: ConnectionStatus
    connected: bool
    expires_at: str | None
    tools: tuple[ToolDefinition, ...]


@dataclass(frozen=True, slots=True)
class Capabilities:
    external_user_id: str
    format: Literal["mcp", "openai"]
    version: str
    services: tuple[CapabilityService, ...]


@dataclass(frozen=True, slots=True)
class ToolsResponse:
    tools: tuple[ToolDefinition, ...]
    version: str
    format: Literal["mcp", "openai"]


@dataclass(frozen=True, slots=True)
class ConnectSession:
    id: str
    token: str
    url: str
    expires_at: str


@dataclass(frozen=True, slots=True)
class HeaderPlacement:
    type: Literal["header"]
    name: str
    prefix: str | None = None


@dataclass(frozen=True, slots=True)
class QueryPlacement:
    type: Literal["query"]
    name: str


CredentialPlacement = HeaderPlacement | QueryPlacement


@dataclass(frozen=True, slots=True)
class OAuthProviderContext:
    api_base_url: str


@dataclass(frozen=True, slots=True)
class OAuthCredentialLease:
    type: Literal["oauth2"]
    lease_id: str
    access_token: str
    token_type: str
    scopes: tuple[str, ...]
    expires_at: str | None
    provider_context: OAuthProviderContext | None = None


@dataclass(frozen=True, slots=True)
class ApiKeyCredentialLease:
    type: Literal["api_key"]
    lease_id: str
    value: str
    placement: CredentialPlacement
    expires_at: str | None


CredentialLease = OAuthCredentialLease | ApiKeyCredentialLease
