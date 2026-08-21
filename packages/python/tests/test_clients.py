from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from authlane import AsyncAuthlane, Authlane


def envelope(data: Any = None, error: Any = None, *, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json={"data": data, "error": error})


def test_sync_resources_are_user_scoped_and_non_throwing() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["authorization"] == "Bearer ak_test"
        if request.url.path.endswith("/connections"):
            return envelope(
                [
                    {
                        "serviceId": "github",
                        "status": "connected",
                        "connected": True,
                        "expiresAt": None,
                        "connectedAt": None,
                        "lastCheckedAt": None,
                        "errorCode": None,
                    }
                ]
            )
        if request.url.path == "/api/v1/connect-sessions":
            assert json.loads(request.content) == {
                "externalUserId": "user_123",
                "allowedServices": [],
                "allowedOrigin": "https://saas.example",
            }
            return envelope(
                {
                    "id": "session_1",
                    "token": "connect-token",
                    "url": "https://app.authlane.io/connect?token=connect-token",
                    "expiresAt": "2026-07-18T12:00:00Z",
                }
            )
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test/",
        transport=httpx.MockTransport(handler),
    ) as client:
        connections = client.user("user_123").connections.list()
        session = client.connect_sessions.create(
            external_user_id="user_123",
            allowed_services=[],
            allowed_origin="https://saas.example",
        )

    assert connections.error is None
    assert connections.data is not None
    assert connections.data[0].service_id == "github"
    assert session.error is None
    assert session.data is not None
    assert session.data.id == "session_1"
    assert [request.url.path for request in requests] == [
        "/api/v1/users/user_123/connections",
        "/api/v1/connect-sessions",
    ]


def test_network_decode_and_validation_failures_are_redacted_results() -> None:
    secret = "credential-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/catalog/services"):
            raise httpx.ConnectError(f"could not connect with {secret}", request=request)
        return httpx.Response(200, text=f"not-json-{secret}")

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        network = client.services.list()
        decode = client.connections.list(external_user_id="user_123")
        validation = client.user("").connections.list()

    assert network.data is None and network.error is not None
    assert network.error.code == "NETWORK_ERROR"
    assert secret not in network.error.message
    assert decode.data is None and decode.error is not None
    assert decode.error.code == "INVALID_RESPONSE"
    assert secret not in decode.error.message
    assert validation.data is None and validation.error is not None
    assert validation.error.code == "VALIDATION_ERROR"


def test_service_carries_what_a_consumer_renders() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return envelope(
            [
                {
                    "id": "github",
                    "name": "GitHub",
                    "authType": "oauth2",
                    "enabled": True,
                    "config": {},
                    "description": "Repositories, issues, pull requests, and code search.",
                    "iconUrl": "https://app.authlane.io/service-icons/github.svg",
                    "brandColor": "#181717",
                    "initials": "GH",
                    "category": "engineering",
                }
            ]
        )

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        result = client.services.list()

    assert result.error is None and result.data is not None
    service = result.data[0]
    assert service.description == "Repositories, issues, pull requests, and code search."
    assert service.icon_url == "https://app.authlane.io/service-icons/github.svg"
    assert service.brand_color == "#181717"
    assert service.initials == "GH"
    assert service.category == "engineering"


def test_service_without_branding_still_parses() -> None:
    """An older API sends none of these fields, and a client on this version must survive it."""

    def handler(request: httpx.Request) -> httpx.Response:
        return envelope(
            [
                {
                    "id": "github",
                    "name": "GitHub",
                    "authType": "oauth2",
                    "enabled": True,
                    "config": {},
                }
            ]
        )

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        result = client.services.list()

    assert result.error is None and result.data is not None
    service = result.data[0]
    assert service.description is None
    assert service.icon_url is None
    assert service.brand_color is None
    assert service.category is None
    assert service.initials == "?"


@pytest.mark.anyio
async def test_async_client_uses_async_transport_and_closes() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/catalog/services"
        return envelope([])

    client = AsyncAuthlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(handler),
    )
    async with client:
        result = await client.services.list()
        assert result.data == [] and result.error is None

    assert client.is_closed


@pytest.mark.anyio
async def test_async_connections_resource_mirrors_sync_get() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return envelope(
            [
                {
                    "serviceId": "github",
                    "status": "connected",
                    "connected": True,
                    "expiresAt": None,
                    "connectedAt": None,
                    "lastCheckedAt": None,
                    "errorCode": None,
                }
            ]
        )

    async with AsyncAuthlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        connection = await client.user("user_123").connections.get("github")
        missing = await client.user("user_123").connections.get("slack")

    assert connection.error is None and connection.data is not None
    assert connection.data.service_id == "github"
    assert missing.data is None and missing.error is not None
    assert missing.error.code == "NOT_FOUND"


@pytest.mark.anyio
async def test_async_user_tool_gets_a_fresh_lease_for_every_direct_provider_call() -> None:
    control_plane_calls: list[str] = []
    provider_calls: list[str] = []

    async def control_plane(request: httpx.Request) -> httpx.Response:
        control_plane_calls.append(request.url.path)
        if request.url.path.endswith("/capabilities"):
            return envelope(
                {
                    "externalUserId": "user_123",
                    "format": "mcp",
                    "version": "v1",
                    "services": [
                        {
                            "serviceId": "stripe",
                            "status": "connected",
                            "connected": True,
                            "expiresAt": None,
                            "tools": [
                                {
                                    "name": "stripe_get_customer",
                                    "description": "Retrieves details of a specific customer",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {"customer_id": {"type": "string"}},
                                        "required": ["customer_id"],
                                    },
                                }
                            ],
                        }
                    ],
                }
            )
        if request.url.path.endswith("/credential-leases"):
            return envelope(
                {
                    "type": "oauth2",
                    "leaseId": f"lease_{len(control_plane_calls)}",
                    "accessToken": "provider-secret",
                    "tokenType": "Bearer",
                    "scopes": [],
                    "expiresAt": None,
                }
            )
        raise AssertionError(f"unexpected request: {request.url}")

    async def provider(request: httpx.Request) -> httpx.Response:
        provider_calls.append(str(request.url))
        assert request.url.host == "api.stripe.com"
        return httpx.Response(200, json={"id": "cus_123"})

    async with AsyncAuthlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(control_plane),
    ) as client:
        listed = await client.user("user_123").tools.list(
            adapter=__import__("authlane.adapters", fromlist=["generic"]).generic(
                async_provider_transport=httpx.MockTransport(provider)
            )
        )
        assert listed.data is not None
        first = await listed.data["stripe_get_customer"].ainvoke({"customer_id": "cus_123"})
        second = await listed.data["stripe_get_customer"].ainvoke({"customer_id": "cus_123"})

    assert first.error is None and second.error is None
    assert control_plane_calls == [
        "/api/v1/users/user_123/capabilities",
        "/api/v1/users/user_123/connections/stripe/credential-leases",
        "/api/v1/users/user_123/connections/stripe/credential-leases",
    ]
    assert len(provider_calls) == 2
    assert all(url.startswith("https://api.stripe.com/") for url in provider_calls)
