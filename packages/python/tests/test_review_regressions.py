from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from authlane import AsyncAuthlane
from authlane.adapters import openai_agents
from authlane.executors import aexecute, execute
from authlane.models import ToolDefinition

CANONICAL = (
    Path(__file__).parents[2] / "integration-contracts" / "generated" / "v1" / "integrations.json"
)


def _oauth() -> dict[str, Any]:
    return {"type": "oauth2", "accessToken": "provider-secret"}


def _capture(
    service_id: str,
    tool_name: str,
    arguments: dict[str, Any],
    *,
    responses: list[httpx.Response] | None = None,
) -> tuple[Any, list[httpx.Request]]:
    requests: list[httpx.Request] = []
    queue = list(responses or [httpx.Response(200, json={"id": "result"})])

    def provider(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/oauth/token/accessible-resources":
            return httpx.Response(200, json=[{"id": "cloud-1"}])
        return queue.pop(0)

    result = execute(
        service_id=service_id,
        tool_name=tool_name,
        arguments=arguments,
        credential=_oauth(),
        transport=httpx.MockTransport(provider),
    )
    return result, requests


def test_calendar_request_defaults_and_event_shape_match_typescript() -> None:
    result, requests = _capture(
        "google-calendar",
        "gcal_create_event",
        {
            "summary": "Review",
            "start_time": "2026-07-20T10:00:00Z",
            "end_time": "2026-07-20T11:00:00Z",
            "timezone": "Europe/Prague",
            "color_id": "5",
        },
    )

    assert result.error is None
    assert dict(requests[0].url.params) == {"sendUpdates": "none"}
    assert json.loads(requests[0].content) == {
        "summary": "Review",
        "start": {"dateTime": "2026-07-20T10:00:00Z", "timeZone": "Europe/Prague"},
        "end": {"dateTime": "2026-07-20T11:00:00Z", "timeZone": "Europe/Prague"},
        "colorId": "5",
    }

    listed, list_requests = _capture("google-calendar", "gcal_list_events", {})
    assert listed.error is None
    assert dict(list_requests[0].url.params) == {"maxResults": "10", "singleEvents": "false"}


def test_drive_defaults_metadata_and_permission_shape_match_typescript() -> None:
    listed, list_requests = _capture("google-drive", "gdrive_list_files", {})
    assert listed.error is None
    assert dict(list_requests[0].url.params) == {
        "pageSize": "10",
        "q": "trashed=false",
        "spaces": "drive",
    }

    shared, share_requests = _capture(
        "google-drive",
        "gdrive_share_file",
        {
            "file_id": "file-1",
            "role": "reader",
            "type": "user",
            "email_address": "dev@example.com",
        },
    )
    assert shared.error is None
    assert json.loads(share_requests[0].content) == {
        "role": "reader",
        "type": "user",
        "emailAddress": "dev@example.com",
    }
    assert dict(share_requests[0].url.params) == {"sendNotificationEmail": "true"}

    uploaded, upload_requests = _capture(
        "google-drive",
        "gdrive_upload_file",
        {
            "name": "hello.txt",
            "content": base64.b64encode(b"hello").decode(),
            "mime_type": "text/plain",
            "description": "Greeting",
            "starred": True,
        },
    )
    assert uploaded.error is None
    multipart = upload_requests[0].content.decode()
    assert '"description":"Greeting"' in multipart
    assert '"starred":true' in multipart


def test_jira_adf_filters_and_transition_name_match_typescript() -> None:
    created, create_requests = _capture(
        "jira",
        "jira_create_issue",
        {
            "projectKey": "AUTH",
            "summary": "Parity",
            "issueType": "Task",
            "description": "Exact body",
            "priority": "High",
            "assigneeAccountId": "account-1",
            "components": ["SDK"],
            "dueDate": "2026-07-31",
        },
    )
    assert created.error is None
    fields = json.loads(create_requests[-1].content)["fields"]
    assert fields["description"] == {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Exact body"}]}],
    }
    assert fields["priority"] == {"name": "High"}
    assert fields["assignee"] == {"accountId": "account-1"}
    assert fields["components"] == [{"name": "SDK"}]
    assert fields["duedate"] == "2026-07-31"

    listed, list_requests = _capture(
        "jira",
        "jira_list_issues",
        {"projectKey": "AUTH", "assigneeAccountId": "account-1", "status": "In Progress"},
    )
    assert listed.error is None
    assert list_requests[-1].url.params["jql"] == (
        'project = AUTH AND assignee = account-1 AND status = "In Progress"'
    )

    transitioned, transition_requests = _capture(
        "jira",
        "jira_transition_issue",
        {
            "issueKey": "AUTH-1",
            "transitionName": "Done",
            "assigneeAccountId": "account-2",
            "resolution": "Done",
        },
        responses=[
            httpx.Response(200, json={"transitions": [{"id": "31", "name": "Done"}]}),
            httpx.Response(204),
        ],
    )
    assert transitioned.error is None
    assert [request.method for request in transition_requests] == ["GET", "GET", "POST"]
    body = json.loads(transition_requests[-1].content)
    assert body == {
        "transition": {"id": "31"},
        "fields": {
            "assignee": {"accountId": "account-2"},
            "resolution": {"name": "Done"},
        },
    }


def test_gmail_notion_github_and_pipedrive_semantics_match_typescript() -> None:
    sent, send_requests = _capture(
        "gmail",
        "gmail_send_email",
        {
            "to": ["dev@example.com"],
            "subject": "Parity",
            "body": "Hello",
            "thread_id": "thread-1",
            "label_ids": ["STARRED"],
        },
    )
    assert sent.error is None
    gmail_body = json.loads(send_requests[0].content)
    assert gmail_body["threadId"] == "thread-1"
    assert gmail_body["labelIds"] == ["STARRED"]

    updated, update_requests = _capture(
        "notion",
        "notion_update_block",
        {"block_id": "block-1", "content": {"paragraph": {"rich_text": []}}},
    )
    assert updated.error is None
    assert json.loads(update_requests[0].content) == {"paragraph": {"rich_text": []}}

    page, page_requests = _capture(
        "notion",
        "notion_get_page",
        {"page_id": "page-1", "filter_properties": ["title", "status"]},
    )
    assert page.error is None
    assert list(page_requests[0].url.params.multi_items()) == [
        ("filter_properties", "title,status")
    ]

    github, _ = _capture(
        "github",
        "github_get_file",
        {"owner": "dxheroes", "repo": "authlane", "path": "README.md"},
        responses=[
            httpx.Response(
                200,
                json={"name": "README.md", "content": base64.b64encode(b"hello").decode()},
            )
        ],
    )
    assert github.error is None
    assert github.data["decodedContent"] == "hello"

    pipedrive, pipedrive_requests = _capture("pipedrive", "pipedrive_list_deals", {})
    assert pipedrive.error is None
    assert pipedrive_requests[0].url.params["status"] == "all_not_deleted"


def test_stripe_list_builder_does_not_leak_fields_from_another_tool() -> None:
    result, requests = _capture(
        "stripe",
        "stripe_list_customers",
        {"limit": 5, "customer": "cus_cross_tool"},
    )

    assert result.error is None
    assert dict(requests[0].url.params) == {"limit": "5"}


@pytest.mark.parametrize("executor", [execute, aexecute])
def test_all_oauth_only_builtins_reject_api_key_leases(executor: Any) -> None:
    canonical = json.loads(CANONICAL.read_text())
    provider_calls: list[httpx.Request] = []

    def sync_provider(request: httpx.Request) -> httpx.Response:
        provider_calls.append(request)
        return httpx.Response(200, json={})

    async def async_provider(request: httpx.Request) -> httpx.Response:
        provider_calls.append(request)
        return httpx.Response(200, json={})

    async def run() -> None:
        for integration in canonical["integrations"]:
            tool = integration["tools"][0]
            kwargs = {
                "service_id": integration["serviceId"],
                "tool_name": tool["name"],
                "arguments": _required_example(tool["inputSchema"]),
                "credential": {
                    "type": "api_key",
                    "value": "provider-secret",
                    "placement": {"type": "header", "name": "X-Unsafe"},
                },
                "transport": httpx.MockTransport(
                    async_provider if executor is aexecute else sync_provider
                ),
            }
            result = await executor(**kwargs) if executor is aexecute else executor(**kwargs)
            assert result.data is None and result.error is not None
            assert result.error.code == "CREDENTIAL_TYPE_UNSUPPORTED"
        assert provider_calls == []

    import anyio

    anyio.run(run)


@pytest.mark.anyio
async def test_deferred_async_adapter_build_cannot_acquire_a_lease() -> None:
    control_plane_calls: list[str] = []

    async def control_plane(request: httpx.Request) -> httpx.Response:
        control_plane_calls.append(request.url.path)
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
                                        "name": "github_list_repos",
                                        "description": "List repos",
                                        "inputSchema": {"type": "object", "properties": {}},
                                    }
                                ],
                            }
                        ],
                    },
                    "error": None,
                },
            )
        raise AssertionError("credential lease must not be requested during deferred build")

    class DeferredAdapter:
        def build_async(self, *, tools: Any, lease: Any, **_: Any) -> Any:
            async def deferred() -> dict[str, Any]:
                import anyio

                await anyio.sleep(0)
                await lease(tools[0].service_id)
                return {}

            return deferred()

    async with AsyncAuthlane(
        api_key="ak_test",
        base_url="https://authlane.test",
        transport=httpx.MockTransport(control_plane),
    ) as client:
        result = await client.user("user_123").tools.list(adapter=DeferredAdapter())

    assert result.data is None and result.error is not None
    assert result.error.code == "ADAPTER_ERROR"
    assert control_plane_calls == ["/api/v1/users/user_123/capabilities"]


def test_openai_agents_observable_schema_is_exactly_canonical() -> None:
    pytest.importorskip("agents")
    schema = {
        "type": "object",
        "properties": {"custom": {"type": "string"}},
        "required": [],
        "additionalProperties": True,
    }
    native = openai_agents().build_sync(
        external_user_id="user_123",
        tools=(
            ToolDefinition(
                name="custom_tool",
                description="Custom",
                input_schema=schema,
                service_id="github",
            ),
        ),
        lease=lambda _: (_ for _ in ()).throw(AssertionError("not invoked")),
    )[0]

    assert native.params_json_schema == schema


def _required_example(schema: dict[str, Any]) -> Any:
    if schema.get("type") == "object":
        properties = schema.get("properties", {})
        return {name: _required_example(properties[name]) for name in schema.get("required", [])}
    if schema.get("type") == "array":
        return [_required_example(schema.get("items", {}))]
    if schema.get("type") in {"number", "integer"}:
        return 1
    if schema.get("type") == "boolean":
        return False
    if "enum" in schema:
        return schema["enum"][0]
    return "x"
