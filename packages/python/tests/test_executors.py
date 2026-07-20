from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from authlane import Authlane
from authlane.adapters import generic
from authlane.executors import EXECUTOR_REGISTRY, MCP_ONLY_TOOL_KEYS, aexecute
from authlane.models import ToolDefinition

CANONICAL = (
    Path(__file__).parents[2] / "integration-contracts" / "generated" / "v1" / "integrations.json"
)


def test_executor_registry_matches_all_canonical_tools_exactly() -> None:
    document = json.loads(CANONICAL.read_text())
    expected = {
        (integration["serviceId"], tool["name"])
        for integration in document["integrations"]
        for tool in integration["tools"]
    }

    assert len(expected) == 189
    assert set(EXECUTOR_REGISTRY) == expected
    assert {service for service, _ in EXECUTOR_REGISTRY} == {
        "airtable",
        "attio",
        "discord",
        "github",
        "gmail",
        "google-calendar",
        "google-drive",
        "hubspot",
        "jira",
        "linear",
        "microsoft-calendar",
        "microsoft-mail",
        "microsoft-sharepoint",
        "notion",
        "pipedrive",
        "salesforce",
        "slack",
        "stripe",
    }


def test_every_canonical_executor_builds_and_sends_a_native_provider_request() -> None:
    document = json.loads(CANONICAL.read_text())

    def provider(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/oauth/token/accessible-resources":
            return httpx.Response(200, json=[{"id": "cloud123"}])
        if request.url.host == "slack.com":
            return httpx.Response(200, json={"ok": True})
        if request.url.host == "api.linear.app":
            return httpx.Response(200, json={"data": {}})
        if request.url.path == "/api/v10/users/@me/channels":
            return httpx.Response(200, json={"id": "dm-channel"})
        return httpx.Response(200, json={})

    executed: set[tuple[str, str]] = set()
    for integration in document["integrations"]:
        for tool in integration["tools"]:
            key = (integration["serviceId"], tool["name"])
            if key in MCP_ONLY_TOOL_KEYS:
                continue
            arguments = _required_example(tool["inputSchema"])
            if tool["name"] == "jira_transition_issue":
                arguments["transitionId"] = "transition-1"
            credential: dict[str, Any] = {
                "type": "oauth2",
                "accessToken": "provider-secret",
            }
            if integration["serviceId"] == "pipedrive":
                credential["providerContext"] = {"apiBaseUrl": "https://acme.pipedrive.com"}
            elif integration["serviceId"] == "salesforce":
                credential["providerContext"] = {"apiBaseUrl": "https://acme.my.salesforce.com"}
            result = EXECUTOR_REGISTRY[(integration["serviceId"], tool["name"])](
                service_id=integration["serviceId"],
                tool_name=tool["name"],
                arguments=arguments,
                credential=credential,
                transport=httpx.MockTransport(provider),
            )
            assert result.error is None, (integration["serviceId"], tool["name"], result.error)
            executed.add(key)

    assert executed == set(EXECUTOR_REGISTRY) - MCP_ONLY_TOOL_KEYS


def test_generic_sync_tool_gets_fresh_lease_then_calls_provider_directly() -> None:
    calls: list[tuple[str, str]] = []

    def control_plane(request: httpx.Request) -> httpx.Response:
        calls.append(("authlane", str(request.url)))
        if request.url.path.endswith("/capabilities"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "externalUserId": "user_123",
                        "format": "mcp",
                        "version": "v1",
                        "services": [
                            {
                                "serviceId": "github",
                                "status": "connected",
                                "connected": True,
                                "expiresAt": None,
                                "tools": [
                                    {
                                        "name": "github_create_issue",
                                        "description": "Creates a new issue in a GitHub repository",
                                        "inputSchema": {
                                            "type": "object",
                                            "properties": {
                                                "owner": {"type": "string"},
                                                "repo": {"type": "string"},
                                                "title": {"type": "string"},
                                            },
                                            "required": ["owner", "repo", "title"],
                                        },
                                    }
                                ],
                            }
                        ],
                    },
                    "error": None,
                },
            )
        if request.url.path.endswith("/credential-leases"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "type": "oauth2",
                        "leaseId": "lease_1",
                        "accessToken": "provider-secret",
                        "tokenType": "Bearer",
                        "scopes": ["repo"],
                        "expiresAt": None,
                    },
                    "error": None,
                },
            )
        raise AssertionError(f"unexpected control-plane request {request.url}")

    def provider(request: httpx.Request) -> httpx.Response:
        calls.append(("provider", str(request.url)))
        assert request.url.host == "api.github.com"
        assert request.headers["authorization"] == "Bearer provider-secret"
        assert json.loads(request.content) == {"title": "Ship Python SDK"}
        return httpx.Response(201, json={"id": 42})

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(control_plane),
    ) as client:
        listed = client.user("user_123").tools.list(
            adapter=generic(provider_transport=httpx.MockTransport(provider))
        )
        assert listed.error is None and listed.data is not None
        result = listed.data["github_create_issue"].invoke(
            {"owner": "dxheroes", "repo": "authlane", "title": "Ship Python SDK"}
        )

    assert result.data == {"id": 42} and result.error is None
    assert [kind for kind, _ in calls] == ["authlane", "authlane", "provider"]
    assert calls[-1][1].startswith("https://api.github.com/")
    assert all("provider-secret" not in url for _, url in calls)


def test_invalid_tool_input_does_not_request_a_lease_or_call_provider() -> None:
    calls: list[str] = []

    def control_plane(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/capabilities"):
            return _capabilities_response("github", "github_create_issue")
        raise AssertionError("lease must not be requested")

    def provider(_: httpx.Request) -> httpx.Response:
        raise AssertionError("provider must not be called")

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(control_plane),
    ) as client:
        listed = client.user("user_123").tools.list(
            adapter=generic(provider_transport=httpx.MockTransport(provider))
        )
        assert listed.data is not None
        result = listed.data["github_create_issue"].invoke({})

    assert result.data is None and result.error is not None
    assert result.error.code == "INVALID_TOOL_INPUT"
    assert calls == ["/api/v1/users/user_123/capabilities"]


def test_provider_failures_and_credentials_are_redacted() -> None:
    secret = "provider-secret"

    def control_plane(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/capabilities"):
            return _capabilities_response("stripe", "stripe_get_customer")
        if request.url.path.endswith("/credential-leases"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "type": "oauth2",
                        "leaseId": "lease_1",
                        "accessToken": secret,
                        "tokenType": "Bearer",
                        "scopes": [],
                        "expiresAt": None,
                    },
                    "error": None,
                },
            )
        raise AssertionError(f"unexpected control-plane request {request.url}")

    def provider(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text=f"rejected {secret}")

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(control_plane),
    ) as client:
        listed = client.user("user_123").tools.list(
            adapter=generic(provider_transport=httpx.MockTransport(provider))
        )
        assert listed.data is not None
        result = listed.data["stripe_get_customer"].invoke({"customer_id": "cus_123"})

    assert result.data is None and result.error is not None
    assert result.error.code == "PROVIDER_ERROR"
    assert secret not in result.error.message


@pytest.mark.parametrize(
    ("service_id", "tool_name", "arguments", "payload"),
    [
        ("slack", "slack_list_users", {}, {"ok": False, "error": "provider-secret"}),
        (
            "linear",
            "linear_list_projects",
            {},
            {"errors": [{"message": "provider-secret"}]},
        ),
    ],
)
def test_provider_native_error_envelopes_are_redacted(
    service_id: str, tool_name: str, arguments: dict[str, Any], payload: dict[str, Any]
) -> None:
    result = EXECUTOR_REGISTRY[(service_id, tool_name)](
        service_id=service_id,
        tool_name=tool_name,
        arguments=arguments,
        credential={"type": "oauth2", "accessToken": "provider-secret"},
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=payload)),
    )

    assert result.data is None and result.error is not None
    assert result.error.code == "PROVIDER_ERROR"
    assert "provider-secret" not in result.error.message


def test_google_drive_download_preserves_binary_metadata_and_request_semantics() -> None:
    requests: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=b"hello", headers={"content-type": "text/plain"})

    result = EXECUTOR_REGISTRY[("google-drive", "gdrive_download_file")](
        service_id="google-drive",
        tool_name="gdrive_download_file",
        arguments={"file_id": "file-1", "supports_all_drives": True},
        credential={"type": "oauth2", "accessToken": "provider-secret"},
        transport=httpx.MockTransport(provider),
    )

    assert result.error is None
    assert result.data == {
        "fileId": "file-1",
        "content": "aGVsbG8=",
        "mimeType": "text/plain",
        "size": 5,
    }
    assert dict(requests[0].url.params) == {"alt": "media", "supportsAllDrives": "true"}
    assert "content-type" not in requests[0].headers


@pytest.mark.parametrize("tool_name", ["gdrive_upload_file", "gdrive_update_file"])
def test_google_drive_multipart_requests_match_native_upload_protocol(tool_name: str) -> None:
    requests: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "file-1"})

    arguments = {
        "name": "hello.txt",
        "content": "aGVsbG8=",
        "mime_type": "text/plain",
    }
    if tool_name == "gdrive_update_file":
        arguments["file_id"] = "file-1"

    result = EXECUTOR_REGISTRY[("google-drive", tool_name)](
        service_id="google-drive",
        tool_name=tool_name,
        arguments=arguments,
        credential={"type": "oauth2", "accessToken": "provider-secret"},
        transport=httpx.MockTransport(provider),
    )

    assert result.error is None
    request = requests[0]
    assert request.method == ("POST" if tool_name == "gdrive_upload_file" else "PATCH")
    assert request.url.host == "www.googleapis.com"
    assert request.url.params["uploadType"] == "multipart"
    assert request.headers["content-type"].startswith("multipart/related; boundary=")
    assert "Content-Transfer-Encoding: base64" in request.content.decode()
    assert "aGVsbG8=" in request.content.decode()


def test_adapter_build_never_requests_a_credential_lease() -> None:
    adapter = generic()
    definition = ToolDefinition(
        name="stripe_get_customer",
        description="Get customer",
        input_schema={"type": "object", "properties": {}},
        service_id="stripe",
    )

    def forbidden(_: str) -> Any:
        raise AssertionError("build must not request a lease")

    assert adapter.build_sync(external_user_id="user_123", tools=(definition,), lease=forbidden)
    assert adapter.build_async(external_user_id="user_123", tools=(definition,), lease=forbidden)


def test_client_rejects_an_adapter_that_attempts_a_lease_during_build() -> None:
    calls: list[str] = []

    def control_plane(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/capabilities"):
            return _capabilities_response("stripe", "stripe_get_customer")
        raise AssertionError("credential endpoint must not be called during build")

    class MaliciousAdapter:
        def build_sync(self, *, tools: Any, lease: Any, **_: Any) -> dict[str, Any]:
            lease(tools[0].service_id)
            return {}

    with Authlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(control_plane),
    ) as client:
        listed = client.user("user_123").tools.list(adapter=MaliciousAdapter())

    assert listed.data is None and listed.error is not None
    assert listed.error.code == "ADAPTER_ERROR"
    assert calls == ["/api/v1/users/user_123/capabilities"]


@pytest.mark.anyio
async def test_async_executor_preserves_discord_user_and_gmail_read_semantics() -> None:
    discord_requests: list[str] = []

    async def discord_provider(request: httpx.Request) -> httpx.Response:
        discord_requests.append(request.url.path)
        return httpx.Response(200, json={"id": "user"})

    credential = {"type": "oauth2", "accessToken": "provider-secret"}
    discord = await aexecute(
        service_id="discord",
        tool_name="discord_get_current_user",
        arguments={},
        credential=credential,
        transport=httpx.MockTransport(discord_provider),
    )
    assert discord.error is None
    assert discord_requests == ["/api/v10/users/@me"]

    gmail_requests: list[str] = []

    async def gmail_provider(request: httpx.Request) -> httpx.Response:
        gmail_requests.append(request.url.path)
        if request.url.path.endswith("/messages"):
            return httpx.Response(200, json={"messages": [{"id": "message-1"}]})
        return httpx.Response(200, json={"id": "message-1"})

    gmail = await aexecute(
        service_id="gmail",
        tool_name="gmail_read_emails",
        arguments={},
        credential=credential,
        transport=httpx.MockTransport(gmail_provider),
    )
    assert gmail.error is None
    assert gmail.data == {"messages": [{"id": "message-1"}]}
    assert gmail_requests == [
        "/gmail/v1/users/me/messages",
        "/gmail/v1/users/me/messages/message-1",
    ]


def _capabilities_response(service_id: str, tool_name: str) -> httpx.Response:
    canonical = json.loads(CANONICAL.read_text())
    integration = next(
        item for item in canonical["integrations"] if item["serviceId"] == service_id
    )
    tool = next(item for item in integration["tools"] if item["name"] == tool_name)
    return httpx.Response(
        200,
        json={
            "data": {
                "externalUserId": "user_123",
                "format": "mcp",
                "version": "v1",
                "services": [
                    {
                        "serviceId": service_id,
                        "status": "connected",
                        "connected": True,
                        "expiresAt": None,
                        "tools": [tool],
                    }
                ],
            },
            "error": None,
        },
    )


def _required_example(schema: dict[str, Any]) -> Any:
    schema_type = schema.get("type")
    if schema_type == "object":
        properties = schema.get("properties", {})
        return {name: _required_example(properties[name]) for name in schema.get("required", [])}
    if schema_type == "array":
        return [_required_example(schema.get("items", {}))]
    if schema_type == "number" or schema_type == "integer":
        return 1
    if schema_type == "boolean":
        return False
    if "enum" in schema:
        return schema["enum"][0]
    return "x"
