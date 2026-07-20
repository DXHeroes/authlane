from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from authlane.executors import execute


@dataclass(frozen=True)
class RequestCase:
    service_id: str
    tool_name: str
    arguments: dict[str, Any]
    method: str
    host: str
    path: str


CASES = [
    RequestCase(
        "airtable",
        "airtable_get_base_schema",
        {"base_id": "app123"},
        "GET",
        "api.airtable.com",
        "/v0/meta/bases/app123/tables",
    ),
    RequestCase(
        "discord",
        "discord_list_guilds",
        {},
        "GET",
        "discord.com",
        "/api/v10/users/@me/guilds",
    ),
    RequestCase(
        "github",
        "github_get_file",
        {"owner": "dxheroes", "repo": "authlane", "path": "README.md", "ref": "main"},
        "GET",
        "api.github.com",
        "/repos/dxheroes/authlane/contents/README.md",
    ),
    RequestCase(
        "gmail",
        "gmail_list_labels",
        {},
        "GET",
        "gmail.googleapis.com",
        "/gmail/v1/users/me/labels",
    ),
    RequestCase(
        "google-calendar",
        "gcal_list_calendars",
        {},
        "GET",
        "www.googleapis.com",
        "/calendar/v3/users/me/calendarList",
    ),
    RequestCase(
        "google-drive",
        "gdrive_get_file",
        {"file_id": "file123", "fields": "id,name"},
        "GET",
        "www.googleapis.com",
        "/drive/v3/files/file123",
    ),
    RequestCase(
        "hubspot",
        "hubspot_get_contact",
        {"contactId": "123", "properties": ["email"]},
        "GET",
        "api.hubapi.com",
        "/crm/v3/objects/contacts/123",
    ),
    RequestCase(
        "jira",
        "jira_get_transitions",
        {"issueKey": "PROJ-1"},
        "GET",
        "api.atlassian.com",
        "/ex/jira/cloud123/rest/api/3/issue/PROJ-1/transitions",
    ),
    RequestCase(
        "linear",
        "linear_list_projects",
        {"limit": 5},
        "POST",
        "api.linear.app",
        "/graphql",
    ),
    RequestCase(
        "notion",
        "notion_get_bot_user",
        {},
        "GET",
        "api.notion.com",
        "/v1/users/me",
    ),
    RequestCase(
        "pipedrive",
        "pipedrive_get_deal",
        {"deal_id": 7},
        "GET",
        "acme.pipedrive.com",
        "/v1/deals/7",
    ),
    RequestCase(
        "salesforce",
        "salesforce_get_object",
        {"objectType": "Contact", "objectId": "003", "fields": ["Id", "Email"]},
        "GET",
        "acme.my.salesforce.com",
        "/services/data/v58.0/sobjects/Contact/003",
    ),
    RequestCase(
        "slack",
        "slack_list_users",
        {},
        "GET",
        "slack.com",
        "/api/users.list",
    ),
    RequestCase(
        "stripe",
        "stripe_get_customer",
        {"customer_id": "cus_123"},
        "GET",
        "api.stripe.com",
        "/v1/customers/cus_123",
    ),
]

JSON_SERVICES = {
    "airtable",
    "discord",
    "gmail",
    "google-calendar",
    "google-drive",
    "hubspot",
    "jira",
    "linear",
    "notion",
    "pipedrive",
    "salesforce",
    "slack",
}


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.service_id)
def test_representative_request_shape_for_each_service(case: RequestCase) -> None:
    provider_requests: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        provider_requests.append(request)
        if request.url.path == "/oauth/token/accessible-resources":
            return httpx.Response(
                200,
                json=[{"id": "cloud123", "url": "https://jira.example", "name": "Jira"}],
            )
        if case.service_id == "slack":
            return httpx.Response(200, json={"ok": True, "members": []})
        if case.service_id == "linear":
            return httpx.Response(200, json={"data": {"projects": {"nodes": []}}})
        return httpx.Response(200, json={"ok": True})

    result = execute(
        service_id=case.service_id,
        tool_name=case.tool_name,
        arguments=case.arguments,
        credential={
            "type": "oauth2",
            "leaseId": "lease_1",
            "accessToken": "provider-secret",
            "tokenType": "Bearer",
            "scopes": [],
            "expiresAt": None,
            **(
                {
                    "providerContext": {
                        "apiBaseUrl": (
                            "https://acme.pipedrive.com"
                            if case.service_id == "pipedrive"
                            else "https://acme.my.salesforce.com"
                        )
                    }
                }
                if case.service_id in {"pipedrive", "salesforce"}
                else {}
            ),
        },
        transport=httpx.MockTransport(provider),
    )

    assert result.error is None
    request = provider_requests[-1]
    assert request.method == case.method
    assert request.url.host == case.host
    assert request.url.path == case.path
    assert request.headers["authorization"] == "Bearer provider-secret"
    if case.service_id in JSON_SERVICES:
        assert request.headers["content-type"] == "application/json"
    if case.service_id == "github":
        assert request.headers["accept"] == "application/vnd.github+json"
        assert request.headers["x-github-api-version"] == "2022-11-28"
        assert request.url.params["ref"] == "main"
    if case.service_id == "google-calendar":
        assert request.url.params["maxResults"] == "100"
    if case.service_id == "google-drive":
        assert request.url.params["fields"] == "id,name"
    if case.service_id == "hubspot":
        assert dict(request.url.params) == {"properties": "email", "archived": "false"}
    if case.service_id == "linear":
        assert "projects" in request.read().decode()
    if case.service_id == "notion":
        assert request.headers["notion-version"] == "2022-06-28"
    if case.service_id == "salesforce":
        assert request.url.params["fields"] == "Id,Email"
    if case.service_id == "slack":
        assert request.url.params["limit"] == "100"
    if case.service_id == "stripe":
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
