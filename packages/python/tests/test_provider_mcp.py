from __future__ import annotations

import json
from typing import Any

import httpx

from authlane.executors import execute


def _mcp_response(
    request: httpx.Request, tools: list[str], *, fail_call: bool = False
) -> httpx.Response:
    payload = json.loads(request.read())
    method = payload.get("method")
    if method == "initialize":
        return httpx.Response(
            200,
            headers={"content-type": "application/json", "mcp-session-id": "session_1"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "result": {"protocolVersion": "2025-06-18", "capabilities": {}},
            },
        )
    if method == "notifications/initialized":
        return httpx.Response(202)
    if method == "tools/list":
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "result": {"tools": [{"name": name} for name in tools]},
            },
        )
    if method == "tools/call":
        if fail_call:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "result": {"content": [{"type": "text", "text": "created"}]},
            },
        )
    raise AssertionError(f"unexpected MCP request: {payload}")


def _credential() -> dict[str, Any]:
    return {
        "type": "oauth2",
        "accessToken": "provider-secret",
        "scopes": ["repo"],
    }


def test_prefers_official_mcp_before_direct_provider_api() -> None:
    direct_requests: list[httpx.Request] = []
    mcp_requests: list[httpx.Request] = []

    def direct(request: httpx.Request) -> httpx.Response:
        direct_requests.append(request)
        return httpx.Response(200, json={"path": "direct"})

    def mcp(request: httpx.Request) -> httpx.Response:
        mcp_requests.append(request)
        return _mcp_response(request, ["issue_write"])

    result = execute(
        service_id="github",
        tool_name="github_create_issue",
        arguments={"owner": "dxheroes", "repo": "authlane", "title": "Test"},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert result.error is None
    assert result.data == {"content": [{"type": "text", "text": "created"}]}
    assert not direct_requests
    assert len(mcp_requests) == 4
    assert all(
        request.headers["authorization"] == "Bearer provider-secret" for request in mcp_requests
    )
    called = json.loads(mcp_requests[-1].read())
    assert called["params"] == {
        "name": "issue_write",
        "arguments": {
            "method": "create",
            "owner": "dxheroes",
            "repo": "authlane",
            "title": "Test",
        },
    }


def test_falls_back_only_when_no_mcp_call_started() -> None:
    direct_requests: list[httpx.Request] = []

    def direct(request: httpx.Request) -> httpx.Response:
        direct_requests.append(request)
        return httpx.Response(200, json={"path": "direct"})

    result = execute(
        service_id="github",
        tool_name="github_create_issue",
        arguments={"owner": "dxheroes", "repo": "authlane", "title": "Test"},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(lambda request: _mcp_response(request, ["other_tool"])),
    )

    assert result.error is None
    assert result.data == {"path": "direct"}
    assert len(direct_requests) == 1


def test_never_retries_a_started_mcp_mutation_through_direct_api() -> None:
    direct_requests: list[httpx.Request] = []

    def direct(request: httpx.Request) -> httpx.Response:
        direct_requests.append(request)
        return httpx.Response(200, json={"path": "direct"})

    result = execute(
        service_id="github",
        tool_name="github_create_issue",
        arguments={"owner": "dxheroes", "repo": "authlane", "title": "Test"},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(
            lambda request: _mcp_response(request, ["issue_write"], fail_call=True)
        ),
    )

    assert result.data is None
    assert result.error is not None and result.error.code == "PROVIDER_ERROR"
    assert not direct_requests


def test_normalizes_canonical_attio_names_to_official_hyphenated_tools() -> None:
    calls: list[dict[str, Any]] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        if payload.get("method") == "tools/call":
            calls.append(payload["params"])
        return _mcp_response(request, ["search-records"])

    result = execute(
        service_id="attio",
        tool_name="attio_search_records",
        arguments={"query": "Linear"},
        credential=_credential(),
        transport=httpx.MockTransport(lambda _: httpx.Response(500)),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert result.error is None
    assert calls == [{"name": "search-records", "arguments": {"query": "Linear"}}]


def test_translates_salesforce_wrapper_to_official_sobject_tool() -> None:
    calls: list[dict[str, Any]] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        if payload.get("method") == "tools/call":
            calls.append(payload["params"])
        return _mcp_response(request, ["createSobjectRecord"])

    result = execute(
        service_id="salesforce",
        tool_name="salesforce_create_contact",
        arguments={"LastName": "Lovelace", "customFields": {"Customer_Tier__c": "Gold"}},
        credential={**_credential(), "scopes": ["mcp_api"]},
        transport=httpx.MockTransport(lambda _: httpx.Response(500)),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert result.error is None
    assert calls == [
        {
            "name": "createSobjectRecord",
            "arguments": {
                "sobject-name": "Contact",
                "body": {"LastName": "Lovelace", "Customer_Tier__c": "Gold"},
            },
        }
    ]


def test_uses_exact_google_schema_and_falls_back_before_unsupported_update() -> None:
    calls: list[dict[str, Any]] = []
    direct_requests: list[httpx.Request] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        if payload.get("method") == "tools/call":
            calls.append(payload["params"])
        return _mcp_response(request, ["create_label", "update_event"])

    label_result = execute(
        service_id="gmail",
        tool_name="gmail_create_label",
        arguments={
            "name": "Customers",
            "background_color": "#000000",
            "text_color": "#ffffff",
        },
        credential=_credential(),
        transport=httpx.MockTransport(lambda _: httpx.Response(500)),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert label_result.error is None
    assert calls == [
        {
            "name": "create_label",
            "arguments": {
                "displayName": "Customers",
                "color": {"backgroundColor": "#000000", "textColor": "#ffffff"},
            },
        }
    ]

    def direct(request: httpx.Request) -> httpx.Response:
        direct_requests.append(request)
        return httpx.Response(200, json={"path": "direct"})

    update_result = execute(
        service_id="google-calendar",
        tool_name="gcal_update_event",
        arguments={"event_id": "event_1", "attendees": [{"email": "user@example.com"}]},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert update_result.error is None
    assert update_result.data == {"path": "direct"}
    assert len(direct_requests) == 1
    assert len(calls) == 1


def test_discovers_jira_cloud_before_rovo_mutation() -> None:
    calls: list[dict[str, Any]] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        method = payload.get("method")
        if method == "tools/call":
            calls.append(payload["params"])
            if payload["params"]["name"] == "getAccessibleAtlassianResources":
                return httpx.Response(
                    200,
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": '[{"id":"cloud-123","url":"https://acme.atlassian.net"}]',
                                }
                            ]
                        },
                    },
                )
        return _mcp_response(request, ["getAccessibleAtlassianResources", "createJiraIssue"])

    result = execute(
        service_id="jira",
        tool_name="jira_create_issue",
        arguments={
            "projectKey": "AUTH",
            "issueType": "Task",
            "summary": "MCP-first",
            "assigneeAccountId": "account-123",
            "labels": ["integration"],
        },
        credential={**_credential(), "scopes": ["write:jira-work"]},
        transport=httpx.MockTransport(lambda _: httpx.Response(500)),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert result.error is None
    assert calls == [
        {"name": "getAccessibleAtlassianResources", "arguments": {}},
        {
            "name": "createJiraIssue",
            "arguments": {
                "cloudId": "cloud-123",
                "projectKey": "AUTH",
                "issueTypeName": "Task",
                "summary": "MCP-first",
                "assignee_account_id": "account-123",
                "additional_fields": {"labels": ["integration"]},
            },
        },
    ]


def test_uses_official_airtable_mcp_only_for_schema_compatible_operations() -> None:
    calls: list[dict[str, Any]] = []
    direct_requests: list[httpx.Request] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        if payload.get("method") == "tools/call":
            calls.append(payload["params"])
        return _mcp_response(request, ["list_bases", "list_tables_for_base", "get_table_schema"])

    def direct(request: httpx.Request) -> httpx.Response:
        direct_requests.append(request)
        return httpx.Response(200, json={"path": "direct"})

    listed = execute(
        service_id="airtable",
        tool_name="airtable_list_bases",
        arguments={},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )
    schema = execute(
        service_id="airtable",
        tool_name="airtable_get_base_schema",
        arguments={"base_id": "app123"},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )
    fallback = execute(
        service_id="airtable",
        tool_name="airtable_get_table_schema",
        arguments={"base_id": "app123", "table_id": "tbl123"},
        credential=_credential(),
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert listed.error is None
    assert schema.error is None
    assert calls == [
        {"name": "list_bases", "arguments": {}},
        {"name": "list_tables_for_base", "arguments": {"baseId": "app123"}},
    ]
    assert fallback.error is None and fallback.data == {"path": "direct"}
    assert len(direct_requests) == 1


def test_prefers_official_pipedrive_mcp_for_compatible_crm_operations() -> None:
    calls: list[dict[str, Any]] = []
    direct_requests: list[httpx.Request] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        if payload.get("method") == "tools/call":
            calls.append(payload["params"])
        return _mcp_response(request, ["getDeal", "getDeals"])

    def direct(request: httpx.Request) -> httpx.Response:
        direct_requests.append(request)
        return httpx.Response(200, json={"path": "direct"})

    credential = {
        **_credential(),
        "providerContext": {"apiBaseUrl": "https://acme.pipedrive.com"},
    }
    deal = execute(
        service_id="pipedrive",
        tool_name="pipedrive_get_deal",
        arguments={"deal_id": 42},
        credential=credential,
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )
    fallback = execute(
        service_id="pipedrive",
        tool_name="pipedrive_list_deals",
        arguments={"stage_id": 7},
        credential=credential,
        transport=httpx.MockTransport(direct),
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert deal.error is None
    assert calls == [{"name": "getDeal", "arguments": {"id": 42}}]
    assert fallback.error is None and fallback.data == {"path": "direct"}
    assert len(direct_requests) == 1


def test_confines_microsoft_work_iq_to_the_selected_workload() -> None:
    calls: list[dict[str, Any]] = []

    def mcp(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        if payload.get("method") == "tools/call":
            calls.append(payload["params"])
        return _mcp_response(request, ["fetch"])

    credential = {
        **_credential(),
        "scopes": ["api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask"],
    }
    allowed = execute(
        service_id="microsoft-mail",
        tool_name="microsoft_mail_fetch",
        arguments={"entityUrls": ["/me/messages"]},
        credential=credential,
        mcp_transport=httpx.MockTransport(mcp),
    )
    blocked = execute(
        service_id="microsoft-mail",
        tool_name="microsoft_mail_fetch",
        arguments={"entityUrls": ["/sites/root"]},
        credential=credential,
        mcp_transport=httpx.MockTransport(mcp),
    )

    assert allowed.error is None
    assert calls == [{"name": "fetch", "arguments": {"entityUrls": ["/me/messages"]}}]
    assert blocked.data is None and blocked.error is not None
    assert blocked.error.code == "PROVIDER_ERROR"
