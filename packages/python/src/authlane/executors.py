from __future__ import annotations

import base64
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Any, cast
from urllib.parse import quote

import httpx
from jsonschema import Draft202012Validator

from ._errors import invalid_tool_input, provider_error
from .contracts import definition_index
from .models import ApiKeyCredentialLease, CredentialLease, OAuthCredentialLease, Result


@dataclass(frozen=True, slots=True)
class RequestSpec:
    method: str
    url: str
    params: list[tuple[str, str]] = field(default_factory=list)
    json_body: Any = None
    content: bytes | str | None = None
    headers: dict[str, str] = field(default_factory=dict)


JSON_PROVIDER_SERVICES = frozenset(
    {
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
        "sentry",
        "slack",
    }
)


def _provider_headers(service_id: str, tool_name: str) -> dict[str, str]:
    if service_id == "github":
        return {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
    if service_id == "stripe":
        return {"Content-Type": "application/x-www-form-urlencoded"}
    if service_id == "google-drive" and tool_name in {
        "gdrive_download_file",
        "gdrive_export_file",
    }:
        return {}

    headers = {"Content-Type": "application/json"} if service_id in JSON_PROVIDER_SERVICES else {}
    if service_id == "jira":
        headers["Accept"] = "application/json"
    if service_id == "notion":
        headers["Notion-Version"] = "2022-06-28"
    return headers


def _clean(value: Mapping[str, Any], *excluded: str) -> dict[str, Any]:
    return {key: item for key, item in value.items() if key not in excluded and item is not None}


def _pairs(value: Mapping[str, Any], names: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [
        (
            remote,
            str(value[local]).lower() if isinstance(value.get(local), bool) else str(value[local]),
        )
        for local, remote in names
        if value.get(local) is not None
    ]


def _email_raw(arguments: Mapping[str, Any]) -> str:
    message = EmailMessage()
    message["To"] = ", ".join(cast(list[str], arguments["to"]))
    message["Subject"] = str(arguments["subject"])
    for source, header in (("cc", "Cc"), ("bcc", "Bcc"), ("reply_to", "Reply-To")):
        if arguments.get(source):
            value = arguments[source]
            message[header] = ", ".join(value) if isinstance(value, list) else str(value)
    body = str(arguments["body"])
    if arguments.get("html"):
        message.set_content(body, subtype="html")
    else:
        message.set_content(body)
    raw = message.as_bytes(policy=message.policy.clone(linesep="\r\n"))
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _airtable(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.airtable.com/v0/"
    table = quote(str(a.get("table_id", "")), safe="")
    base = str(a.get("base_id", ""))
    if tool == "airtable_list_records":
        params: list[tuple[str, str]] = [("fields[]", str(v)) for v in a.get("fields", [])]
        params += _pairs(
            a,
            [
                ("filter_by_formula", "filterByFormula"),
                ("max_records", "maxRecords"),
                ("page_size", "pageSize"),
            ],
        )
        for index, sort in enumerate(a.get("sort", [])):
            params += [
                (f"sort[{index}][field]", str(sort["field"])),
                (f"sort[{index}][direction]", str(sort["direction"])),
            ]
        params += _pairs(
            a,
            [
                ("view", "view"),
                ("cell_format", "cellFormat"),
                ("time_zone", "timeZone"),
                ("user_locale", "userLocale"),
                ("offset", "offset"),
            ],
        )
        return RequestSpec("GET", f"{root}{base}/{table}", params=params)
    if tool in {"airtable_create_record", "airtable_create_records_batch"}:
        key = "fields" if tool.endswith("record") else "records"
        params = [("typecast", "true")] if a.get("typecast") else []
        return RequestSpec("POST", f"{root}{base}/{table}", params=params, json_body={key: a[key]})
    if tool in {"airtable_update_record", "airtable_update_records_batch"}:
        path = f"{root}{base}/{table}" + (f"/{a['record_id']}" if tool.endswith("record") else "")
        key = "fields" if tool.endswith("record") else "records"
        return RequestSpec(
            "PUT" if a.get("replace") else "PATCH",
            path,
            params=[("typecast", "true")] if a.get("typecast") else [],
            json_body={key: a[key]},
        )
    if tool == "airtable_get_record":
        return RequestSpec(
            "GET",
            f"{root}{base}/{table}/{a['record_id']}",
            params=_pairs(
                a,
                [
                    ("cell_format", "cellFormat"),
                    ("time_zone", "timeZone"),
                    ("user_locale", "userLocale"),
                ],
            ),
        )
    if tool == "airtable_delete_record":
        return RequestSpec("DELETE", f"{root}{base}/{table}/{a['record_id']}")
    if tool == "airtable_delete_records_batch":
        return RequestSpec(
            "DELETE",
            f"{root}{base}/{table}",
            params=[("records[]", str(value)) for value in a["record_ids"]],
        )
    if tool == "airtable_list_bases":
        return RequestSpec("GET", f"{root}meta/bases", params=_pairs(a, [("offset", "offset")]))
    if tool == "airtable_get_base_schema":
        return RequestSpec("GET", f"{root}meta/bases/{base}/tables")
    return RequestSpec("GET", f"{root}meta/bases/{base}/tables/{table}")


def _discord(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://discord.com/api/v10/"
    if tool == "discord_send_message":
        return RequestSpec(
            "POST", f"{root}channels/{a['channel_id']}/messages", json_body=_clean(a, "channel_id")
        )
    if tool == "discord_list_channels":
        return RequestSpec("GET", f"{root}guilds/{a['guild_id']}/channels")
    if tool == "discord_create_channel":
        return RequestSpec(
            "POST",
            f"{root}guilds/{a['guild_id']}/channels",
            json_body={
                "name": a["name"],
                "type": a.get("type", 0),
                **({"topic": a["topic"]} if a.get("topic") else {}),
            },
        )
    return RequestSpec(
        "POST", f"{root}users/@me/channels", json_body={"recipient_id": a["user_id"]}
    )


def _github(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.github.com"
    repo = f"/repos/{a.get('owner')}/{a.get('repo')}"
    if tool == "github_create_issue":
        return RequestSpec("POST", root + repo + "/issues", json_body=_clean(a, "owner", "repo"))
    if tool == "github_list_issues":
        return RequestSpec(
            "GET",
            root + repo + "/issues",
            params=[
                ("state", str(a.get("state", "open"))),
                ("per_page", str(min(a.get("limit", 30), 100))),
            ],
        )
    if tool == "github_create_pull_request":
        return RequestSpec(
            "POST",
            root + repo + "/pulls",
            json_body={**_clean(a, "owner", "repo"), "draft": a.get("draft", False)},
        )
    if tool == "github_list_repos":
        return RequestSpec(
            "GET",
            root + "/user/repos",
            params=[
                ("type", str(a.get("type", "owner"))),
                ("sort", str(a.get("sort", "updated"))),
                ("direction", str(a.get("direction", "desc"))),
                ("per_page", str(min(a.get("limit", 30), 100))),
            ],
        )
    if tool == "github_get_file":
        return RequestSpec(
            "GET", root + repo + f"/contents/{a['path']}", params=_pairs(a, [("ref", "ref")])
        )
    if tool == "github_create_file":
        body = _clean(a, "owner", "repo", "path")
        body["content"] = base64.b64encode(str(a["content"]).encode()).decode()
        return RequestSpec("PUT", root + repo + f"/contents/{a['path']}", json_body=body)
    if tool == "github_search_code":
        return RequestSpec(
            "GET",
            root + "/search/code",
            params=[
                ("q", str(a["query"])),
                *(([("sort", str(a["sort"]))]) if a.get("sort") else []),
                ("order", str(a.get("order", "desc"))),
                ("per_page", str(min(a.get("limit", 30), 100))),
            ],
        )
    return RequestSpec(
        "GET",
        root + repo + "/pulls",
        params=[
            ("state", str(a.get("state", "open"))),
            ("sort", str(a.get("sort", "created"))),
            ("direction", str(a.get("direction", "desc"))),
            *_pairs(a, [("head", "head"), ("base", "base")]),
            ("per_page", str(min(a.get("limit", 30), 100))),
        ],
    )


def _gmail(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://gmail.googleapis.com/gmail/v1/users/me"
    if tool in {"gmail_send_email", "gmail_create_draft"}:
        raw_body = {"raw": _email_raw(a)}
        return RequestSpec(
            "POST",
            root + ("/messages/send" if tool == "gmail_send_email" else "/drafts"),
            json_body=raw_body if tool == "gmail_send_email" else {"message": raw_body},
        )
    if tool in {"gmail_read_emails", "gmail_search_emails"}:
        params = [
            ("maxResults", str(a.get("max_results", 10))),
            *(([("q", str(a["query"]))]) if tool == "gmail_search_emails" else []),
        ]
        params += [("labelIds", str(value)) for value in a.get("label_ids", [])]
        params += _pairs(
            a, [("include_spam_trash", "includeSpamTrash"), ("page_token", "pageToken")]
        )
        return RequestSpec("GET", root + "/messages", params=params)
    if tool == "gmail_get_email":
        params = [("format", str(a.get("format", "full")))] + [
            ("metadataHeaders", str(value)) for value in a.get("metadata_headers", [])
        ]
        return RequestSpec("GET", root + f"/messages/{a['id']}", params=params)
    if tool == "gmail_modify_email":
        return RequestSpec(
            "POST",
            root + f"/messages/{a['id']}/modify",
            json_body={
                remote: a[local]
                for local, remote in (
                    ("add_label_ids", "addLabelIds"),
                    ("remove_label_ids", "removeLabelIds"),
                )
                if a.get(local)
            },
        )
    if tool == "gmail_delete_email":
        return RequestSpec("DELETE", root + f"/messages/{a['id']}")
    if tool == "gmail_trash_email":
        return RequestSpec("POST", root + f"/messages/{a['id']}/trash")
    if tool == "gmail_list_labels":
        return RequestSpec("GET", root + "/labels")
    if tool == "gmail_create_label":
        label_body: dict[str, Any] = {
            "name": a["name"],
            "labelListVisibility": a.get("label_list_visibility", "labelShow"),
            "messageListVisibility": a.get("message_list_visibility", "show"),
        }
        if a.get("background_color") or a.get("text_color"):
            label_body["color"] = _clean(
                {"backgroundColor": a.get("background_color"), "textColor": a.get("text_color")}
            )
        return RequestSpec("POST", root + "/labels", json_body=label_body)
    if tool == "gmail_get_thread":
        return RequestSpec(
            "GET",
            root + f"/threads/{a['id']}",
            params=[
                ("format", str(a.get("format", "full"))),
                *[("metadataHeaders", str(v)) for v in a.get("metadata_headers", [])],
            ],
        )
    return RequestSpec(
        "GET",
        root + "/drafts",
        params=[
            ("maxResults", str(a.get("max_results", 10))),
            *_pairs(a, [("page_token", "pageToken")]),
        ],
    )


def _gcal(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://www.googleapis.com/calendar/v3"
    calendar_id = quote(str(a.get("calendar_id", "primary")), safe="")
    event_id = a.get("event_id")
    if tool in {"gcal_create_event", "gcal_update_event"}:
        body = _clean(a, "calendar_id", "event_id", "send_updates", "conference_data_version")
        return RequestSpec(
            "POST" if tool == "gcal_create_event" else "PATCH",
            f"{root}/calendars/{calendar_id}/events" + (f"/{event_id}" if event_id else ""),
            params=_pairs(
                a,
                [
                    ("send_updates", "sendUpdates"),
                    ("conference_data_version", "conferenceDataVersion"),
                ],
            ),
            json_body=body,
        )
    if tool == "gcal_list_events":
        params = [
            ("maxResults", str(a.get("max_results", 100))),
            ("singleEvents", str(a.get("single_events", True)).lower()),
        ]
        params += _pairs(
            a,
            [
                ("time_min", "timeMin"),
                ("time_max", "timeMax"),
                ("page_token", "pageToken"),
                ("order_by", "orderBy"),
                ("show_deleted", "showDeleted"),
                ("q", "q"),
                ("updated_min", "updatedMin"),
                ("timezone", "timeZone"),
            ],
        )
        return RequestSpec("GET", f"{root}/calendars/{calendar_id}/events", params=params)
    if tool == "gcal_get_event":
        return RequestSpec(
            "GET",
            f"{root}/calendars/{calendar_id}/events/{event_id}",
            params=_pairs(a, [("timezone", "timeZone")]),
        )
    if tool == "gcal_delete_event":
        return RequestSpec(
            "DELETE",
            f"{root}/calendars/{calendar_id}/events/{event_id}",
            params=_pairs(a, [("send_updates", "sendUpdates")]),
        )
    if tool == "gcal_list_calendars":
        return RequestSpec(
            "GET",
            f"{root}/users/me/calendarList",
            params=[
                ("maxResults", str(a.get("max_results", 100))),
                *_pairs(
                    a,
                    [
                        ("min_access_role", "minAccessRole"),
                        ("show_deleted", "showDeleted"),
                        ("show_hidden", "showHidden"),
                        ("page_token", "pageToken"),
                    ],
                ),
            ],
        )
    return RequestSpec(
        "POST",
        f"{root}/calendars/{calendar_id}/events/quickAdd",
        params=[("text", str(a["text"])), *_pairs(a, [("send_updates", "sendUpdates")])],
    )


def _gdrive(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://www.googleapis.com/drive/v3"
    file_id = a.get("file_id")
    if tool == "gdrive_list_files":
        query = a.get("query")
        folder = a.get("folder_id")
        final = (
            f"({query}) and '{folder}' in parents"
            if query and folder
            else (f"'{folder}' in parents" if folder else query)
        )
        params = [
            ("pageSize", str(a.get("max_results", 100))),
            *_pairs(
                a,
                [
                    ("page_token", "pageToken"),
                    ("order_by", "orderBy"),
                    ("spaces", "spaces"),
                    ("fields", "fields"),
                ],
            ),
        ]
        if final:
            params.append(("q", str(final)))
        if a.get("supports_all_drives"):
            params += [("supportsAllDrives", "true"), ("includeItemsFromAllDrives", "true")]
        return RequestSpec("GET", root + "/files", params=params)
    if tool == "gdrive_get_file":
        return RequestSpec(
            "GET",
            f"{root}/files/{file_id}",
            params=_pairs(a, [("fields", "fields"), ("supports_all_drives", "supportsAllDrives")]),
        )
    if tool in {"gdrive_download_file", "gdrive_export_file"}:
        export = tool == "gdrive_export_file" or a.get("mime_type") is not None
        endpoint = f"{root}/files/{file_id}" + ("/export" if export else "")
        params = [("mimeType", str(a["mime_type"]))] if export else [("alt", "media")]
        if tool == "gdrive_download_file" and a.get("supports_all_drives"):
            params.append(("supportsAllDrives", "true"))
        return RequestSpec("GET", endpoint, params=params)
    if tool == "gdrive_create_folder":
        metadata = {"name": a["name"], "mimeType": "application/vnd.google-apps.folder"}
        if a.get("parent_folder_id"):
            metadata["parents"] = [a["parent_folder_id"]]
        return RequestSpec(
            "POST",
            root + "/files",
            params=[("supportsAllDrives", "true")] if a.get("supports_all_drives") else [],
            json_body=metadata,
        )
    if tool == "gdrive_update_file":
        metadata = _clean(
            a,
            "file_id",
            "content",
            "mime_type",
            "supports_all_drives",
            "add_parents",
            "remove_parents",
        )
        params = _pairs(a, [("supports_all_drives", "supportsAllDrives")])
        if a.get("add_parents"):
            params.append(("addParents", ",".join(a["add_parents"])))
        if a.get("remove_parents"):
            params.append(("removeParents", ",".join(a["remove_parents"])))
        if a.get("content") and a.get("mime_type"):
            boundary = "-------314159265358979323846"
            content = _gdrive_multipart_content(
                metadata, str(a["content"]), str(a["mime_type"]), boundary
            )
            return RequestSpec(
                "PATCH",
                f"https://www.googleapis.com/upload/drive/v3/files/{file_id}",
                params=[("uploadType", "multipart")],
                content=content,
                headers={"Content-Type": f"multipart/related; boundary={boundary}"},
            )
        return RequestSpec("PATCH", f"{root}/files/{file_id}", params=params, json_body=metadata)
    if tool == "gdrive_delete_file":
        return RequestSpec(
            "DELETE",
            f"{root}/files/{file_id}",
            params=_pairs(a, [("supports_all_drives", "supportsAllDrives")]),
        )
    if tool == "gdrive_trash_file":
        return RequestSpec(
            "PATCH",
            f"{root}/files/{file_id}",
            params=_pairs(a, [("supports_all_drives", "supportsAllDrives")]),
            json_body={"trashed": True},
        )
    if tool == "gdrive_copy_file":
        return RequestSpec(
            "POST",
            f"{root}/files/{file_id}/copy",
            params=_pairs(a, [("supports_all_drives", "supportsAllDrives")]),
            json_body=_clean(a, "file_id", "supports_all_drives"),
        )
    if tool == "gdrive_search_files":
        params = [
            ("q", str(a["query"])),
            ("pageSize", str(a.get("max_results", 100))),
            ("orderBy", str(a.get("order_by", "modifiedTime desc"))),
            *_pairs(a, [("page_token", "pageToken")]),
        ]
        if a.get("supports_all_drives"):
            params += [("supportsAllDrives", "true"), ("includeItemsFromAllDrives", "true")]
        return RequestSpec("GET", root + "/files", params=params)
    if tool == "gdrive_share_file":
        permission = _clean(
            a, "file_id", "send_notification_email", "email_message", "supports_all_drives"
        )
        return RequestSpec(
            "POST",
            f"{root}/files/{file_id}/permissions",
            params=[
                ("sendNotificationEmail", str(a.get("send_notification_email", True)).lower()),
                *_pairs(
                    a,
                    [
                        ("email_message", "emailMessage"),
                        ("supports_all_drives", "supportsAllDrives"),
                    ],
                ),
            ],
            json_body=permission,
        )
    if tool == "gdrive_list_permissions":
        return RequestSpec(
            "GET",
            f"{root}/files/{file_id}/permissions",
            params=_pairs(a, [("supports_all_drives", "supportsAllDrives")]),
        )
    if tool == "gdrive_remove_permission":
        return RequestSpec(
            "DELETE",
            f"{root}/files/{file_id}/permissions/{a['permission_id']}",
            params=_pairs(a, [("supports_all_drives", "supportsAllDrives")]),
        )
    # Multipart upload is intentionally assembled exactly in the customer process.
    metadata = {"name": a["name"]}
    if a.get("parent_folder_id"):
        metadata["parents"] = [a["parent_folder_id"]]
    boundary = "-------314159265358979323846"
    content = _gdrive_multipart_content(metadata, str(a["content"]), str(a["mime_type"]), boundary)
    return RequestSpec(
        "POST",
        "https://www.googleapis.com/upload/drive/v3/files",
        params=[("uploadType", "multipart")],
        content=content,
        headers={"Content-Type": f"multipart/related; boundary={boundary}"},
    )


def _gdrive_multipart_content(
    metadata: Mapping[str, Any], content: str, mime_type: str, boundary: str
) -> str:
    return (
        f"\r\n--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata, separators=(',', ':'))}"
        f"\r\n--{boundary}\r\nContent-Type: {mime_type}\r\n"
        "Content-Transfer-Encoding: base64\r\n\r\n"
        f"{content}\r\n--{boundary}--"
    )


def _hubspot(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.hubapi.com/crm/v3/objects/"
    kind = "contacts" if "contact" in tool else "deals"
    if tool in {"hubspot_create_contact", "hubspot_create_deal"}:
        custom = cast(Mapping[str, Any], a.get("customProperties", {}))
        associations = a.get("associations")
        props = {**_clean(a, "customProperties", "associations"), **custom}
        body: dict[str, Any] = {"properties": props}
        if associations:
            body["associations"] = associations
        return RequestSpec("POST", root + kind, json_body=body)
    if tool in {"hubspot_list_contacts", "hubspot_list_deals"}:
        body = {
            "limit": a.get("limit", 10),
            "archived": a.get("archived", False),
            **_clean(a, "limit", "archived"),
        }
        return RequestSpec("POST", root + kind + "/search", json_body=body)
    object_id = a.get("contactId", a.get("dealId"))
    if tool in {"hubspot_get_contact", "hubspot_get_deal"}:
        params = [("archived", str(a.get("archived", False)).lower())]
        if a.get("properties"):
            params.append(("properties", ",".join(a["properties"])))
        return RequestSpec("GET", root + f"{kind}/{object_id}", params=params)
    custom = cast(Mapping[str, Any], a.get("customProperties", {}))
    props = {**_clean(a, "contactId", "dealId", "customProperties"), **custom}
    return RequestSpec("PATCH", root + f"{kind}/{object_id}", json_body={"properties": props})


def _jira(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.atlassian.com/ex/jira/{cloud}/rest/api/3"
    if tool == "jira_create_issue":
        fields = {
            "project": {"key": a["projectKey"]},
            "summary": a["summary"],
            "issuetype": {"name": a["issueType"]},
        }
        fields.update(_clean(a, "projectKey", "summary", "issueType"))
        return RequestSpec("POST", root + "/issue", json_body={"fields": fields})
    if tool == "jira_list_issues":
        params = [
            ("maxResults", str(a.get("maxResults", 50))),
            ("startAt", str(a.get("startAt", 0))),
        ]
        jql = a.get("jql") or (f"project = {a['projectKey']}" if a.get("projectKey") else None)
        if jql:
            params.append(("jql", str(jql)))
        if a.get("fields"):
            params.append(("fields", ",".join(a["fields"])))
        return RequestSpec("GET", root + "/search", params=params)
    key = a.get("issueKey")
    if tool == "jira_get_transitions":
        return RequestSpec("GET", root + f"/issue/{key}/transitions")
    if tool == "jira_transition_issue":
        body: dict[str, Any] = {"transition": {"id": a["transitionId"]}}
        if a.get("comment"):
            body["update"] = {
                "comment": [
                    {
                        "add": {
                            "body": {
                                "type": "doc",
                                "version": 1,
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": a["comment"]}],
                                    }
                                ],
                            }
                        }
                    }
                ]
            }
        return RequestSpec("POST", root + f"/issue/{key}/transitions", json_body=body)
    if tool == "jira_update_issue":
        return RequestSpec(
            "PUT", root + f"/issue/{key}", json_body={"fields": _clean(a, "issueKey")}
        )
    body = {
        "body": {
            "type": "doc",
            "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": a["comment"]}]}],
        }
    }
    return RequestSpec("POST", root + f"/issue/{key}/comment", json_body=body)


def _linear(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    op = {
        "linear_create_issue": "IssueCreate",
        "linear_update_issue": "IssueUpdate",
        "linear_list_issues": "Issues",
        "linear_list_projects": "Projects",
        "linear_create_project": "ProjectCreate",
    }[tool]
    if tool.startswith("linear_create_"):
        variables = {"input": _clean(a)}
        query = f"mutation {op}($input: {op.replace('Create', 'CreateInput')}!) {{ {op[0].lower() + op[1:]}(input: $input) {{ success }} }}"
    elif tool == "linear_update_issue":
        variables = {"id": a["issueId"], "input": _clean(a, "issueId")}
        query = "mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }"
    else:
        variables = None
        query = f"query {op} {{ {op.lower()}(first: {min(a.get('limit', 50), 250)}) {{ nodes {{ id }} }} }}"
    body: dict[str, Any] = {"query": query}
    if variables is not None:
        body["variables"] = variables
    return RequestSpec("POST", "https://api.linear.app/graphql", json_body=body)


def _notion(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.notion.com/v1"
    if tool == "notion_create_page":
        return RequestSpec("POST", root + "/pages", json_body=dict(a))
    if tool == "notion_query_database":
        return RequestSpec(
            "POST",
            root + f"/databases/{a['database_id']}/query",
            json_body=_clean(a, "database_id"),
        )
    if tool == "notion_update_page":
        return RequestSpec("PATCH", root + f"/pages/{a['page_id']}", json_body=_clean(a, "page_id"))
    if tool == "notion_get_page":
        return RequestSpec(
            "GET",
            root + f"/pages/{a['page_id']}",
            params=[("filter_properties[]", str(v)) for v in a.get("filter_properties", [])],
        )
    if tool == "notion_get_database":
        return RequestSpec("GET", root + f"/databases/{a['database_id']}")
    if tool in {"notion_list_databases", "notion_search"}:
        body = _clean(a)
        if tool == "notion_list_databases":
            body["filter"] = {"property": "object", "value": "database"}
        return RequestSpec("POST", root + "/search", json_body=body)
    if tool == "notion_append_block_children":
        return RequestSpec(
            "PATCH",
            root + f"/blocks/{a['block_id']}/children",
            json_body={
                "children": a["children"],
                **({"after": a["after"]} if a.get("after") else {}),
            },
        )
    if tool == "notion_get_block":
        return RequestSpec("GET", root + f"/blocks/{a['block_id']}")
    if tool == "notion_get_block_children":
        return RequestSpec(
            "GET",
            root + f"/blocks/{a['block_id']}/children",
            params=_pairs(a, [("start_cursor", "start_cursor"), ("page_size", "page_size")]),
        )
    if tool == "notion_update_block":
        return RequestSpec(
            "PATCH", root + f"/blocks/{a['block_id']}", json_body=_clean(a, "block_id")
        )
    if tool == "notion_delete_block":
        return RequestSpec("PATCH", root + f"/blocks/{a['block_id']}", json_body={"archived": True})
    if tool == "notion_get_user":
        return RequestSpec("GET", root + f"/users/{a['user_id']}")
    if tool == "notion_list_users":
        return RequestSpec(
            "GET",
            root + "/users",
            params=_pairs(a, [("start_cursor", "start_cursor"), ("page_size", "page_size")]),
        )
    return RequestSpec("GET", root + "/users/me")


def _pipedrive(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.pipedrive.com/v1/"
    if tool in {"pipedrive_create_deal", "pipedrive_add_contact"}:
        return RequestSpec(
            "POST", root + ("deals" if tool.endswith("deal") else "persons"), json_body=dict(a)
        )
    if tool in {"pipedrive_list_deals", "pipedrive_list_contacts"}:
        params = [
            ("start", str(a.get("start", 0))),
            ("limit", str(a.get("limit", 100))),
            *_pairs(
                a,
                [
                    ("user_id", "user_id"),
                    ("filter_id", "filter_id"),
                    ("stage_id", "stage_id"),
                    ("status", "status"),
                    ("sort", "sort"),
                    ("first_char", "first_char"),
                ],
            ),
        ]
        if a.get("owned_by_you"):
            params.append(("owned_by_you", "1"))
        return RequestSpec(
            "GET", root + ("deals" if tool.endswith("deals") else "persons"), params=params
        )
    if tool in {"pipedrive_get_deal", "pipedrive_get_contact"}:
        return RequestSpec(
            "GET",
            root
            + (f"deals/{a['deal_id']}" if tool.endswith("deal") else f"persons/{a['person_id']}"),
        )
    if tool in {"pipedrive_update_deal", "pipedrive_update_contact"}:
        key = "deal_id" if tool.endswith("deal") else "person_id"
        kind = "deals" if tool.endswith("deal") else "persons"
        return RequestSpec("PUT", root + f"{kind}/{a[key]}", json_body=_clean(a, key))
    params = [
        ("term", str(a["term"])),
        ("exact_match", "1" if a.get("exact_match") else "0"),
        ("start", str(a.get("start", 0))),
        ("limit", str(a.get("limit", 100))),
    ]
    if a.get("item_types"):
        params.append(("item_types", ",".join(a["item_types"])))
    params += _pairs(a, [("fields", "fields")])
    return RequestSpec("GET", root + "itemSearch", params=params)


def _salesforce(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://na1.salesforce.com/services/data/v58.0/"
    if tool == "salesforce_query":
        return RequestSpec(
            "GET",
            root + ("queryAll" if a.get("includeDeleted") else "query"),
            params=[("q", str(a["query"]))],
        )
    if tool == "salesforce_get_object":
        return RequestSpec(
            "GET",
            root + f"sobjects/{a['objectType']}/{a['objectId']}",
            params=[("fields", ",".join(a["fields"]))] if a.get("fields") else [],
        )
    custom = cast(Mapping[str, Any], a.get("customFields", {}))
    body = {**_clean(a, "customFields", "opportunityId"), **custom}
    if tool == "salesforce_create_contact":
        return RequestSpec("POST", root + "sobjects/Contact", json_body=body)
    if tool == "salesforce_create_opportunity":
        return RequestSpec("POST", root + "sobjects/Opportunity", json_body=body)
    return RequestSpec("PATCH", root + f"sobjects/Opportunity/{a['opportunityId']}", json_body=body)


def _sentry(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://sentry.io/api/0/"
    if tool == "sentry_list_issues":
        endpoint = (
            f"projects/{a['organizationSlug']}/{a['projectSlug']}/issues/"
            if a.get("projectSlug")
            else f"organizations/{a['organizationSlug']}/issues/"
        )
        params = _pairs(a, [("query", "query")])
        if a.get("status"):
            params.append(("query", f"is:{a['status']}"))
        params += [
            ("statsPeriod", str(a.get("statsPeriod", "14d"))),
            ("limit", str(a.get("limit", 25))),
            *_pairs(a, [("cursor", "cursor")]),
            ("sort", str(a.get("sortBy", "date"))),
        ]
        return RequestSpec("GET", root + endpoint, params=params)
    issue = a.get("issueId")
    if tool == "sentry_resolve_issue":
        return RequestSpec("PUT", root + f"issues/{issue}/", json_body=_clean(a, "issueId"))
    if tool == "sentry_get_issue":
        return RequestSpec("GET", root + f"issues/{issue}/")
    if tool == "sentry_list_events":
        return RequestSpec(
            "GET",
            root + f"issues/{issue}/events/",
            params=[("limit", str(a.get("limit", 25))), *_pairs(a, [("cursor", "cursor")])],
        )
    return RequestSpec("POST", root + f"issues/{issue}/comments/", json_body={"text": a["comment"]})


def _slack(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://slack.com/api/"
    if tool == "slack_send_message":
        return RequestSpec("POST", root + "chat.postMessage", json_body=dict(a))
    if tool == "slack_list_channels":
        return RequestSpec(
            "GET",
            root + "conversations.list",
            params=[
                ("types", str(a.get("types", "public_channel"))),
                ("exclude_archived", str(a.get("exclude_archived", True)).lower()),
                ("limit", str(min(a.get("limit", 100), 1000))),
            ],
        )
    if tool == "slack_create_channel":
        return RequestSpec(
            "POST",
            root + "conversations.create",
            json_body={"name": a["name"], "is_private": a.get("is_private", False)},
        )
    if tool == "slack_post_file":
        return RequestSpec("POST", root + "files.upload", json_body=dict(a))
    if tool == "slack_list_users":
        return RequestSpec(
            "GET",
            root + "users.list",
            params=[
                ("limit", str(min(a.get("limit", 100), 1000))),
                *_pairs(a, [("cursor", "cursor")]),
            ],
        )
    profile = {"status_text": a["status_text"], "status_expiration": a.get("status_expiration", 0)}
    if a.get("status_emoji"):
        profile["status_emoji"] = a["status_emoji"]
    return RequestSpec("POST", root + "users.profile.set", json_body={"profile": profile})


def _stripe(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.stripe.com/v1/"
    if tool == "stripe_get_customer":
        return RequestSpec("GET", root + f"customers/{a['customer_id']}")
    if tool == "stripe_get_charge":
        return RequestSpec("GET", root + f"charges/{a['charge_id']}")
    kind = "customers" if tool == "stripe_list_customers" else "charges"
    params = [
        ("limit", str(min(a.get("limit", 10), 100))),
        *_pairs(
            a, [("starting_after", "starting_after"), ("email", "email"), ("customer", "customer")]
        ),
    ]
    return RequestSpec("GET", root + kind, params=params)


BUILDERS = {
    "airtable": _airtable,
    "discord": _discord,
    "github": _github,
    "gmail": _gmail,
    "google-calendar": _gcal,
    "google-drive": _gdrive,
    "hubspot": _hubspot,
    "jira": _jira,
    "linear": _linear,
    "notion": _notion,
    "pipedrive": _pipedrive,
    "salesforce": _salesforce,
    "sentry": _sentry,
    "slack": _slack,
    "stripe": _stripe,
}


def _credential_headers(
    credential: CredentialLease | Mapping[str, Any],
) -> tuple[dict[str, str], list[tuple[str, str]]]:
    if isinstance(credential, OAuthCredentialLease):
        return {"Authorization": f"Bearer {credential.access_token}"}, []
    if isinstance(credential, ApiKeyCredentialLease):
        if credential.placement.type == "header":
            return {
                credential.placement.name: f"{credential.placement.prefix or ''}{credential.value}"
            }, []
        return {}, [(credential.placement.name, credential.value)]
    raw = credential
    if {"refreshToken", "refresh_token", "idToken", "id_token"}.intersection(raw):
        raise ValueError("forbidden credential")
    if raw.get("type") == "oauth2" and isinstance(raw.get("accessToken"), str):
        return {"Authorization": f"Bearer {raw['accessToken']}"}, []
    placement = cast(Mapping[str, Any], raw.get("placement", {}))
    value = raw.get("value")
    if (
        raw.get("type") == "api_key"
        and isinstance(value, str)
        and placement.get("type") == "header"
    ):
        return {str(placement["name"]): f"{placement.get('prefix', '')}{value}"}, []
    if raw.get("type") == "api_key" and isinstance(value, str) and placement.get("type") == "query":
        return {}, [(str(placement["name"]), value)]
    raise ValueError("invalid credential")


def _parse_provider_response(
    response: httpx.Response,
    service_id: str,
    tool_name: str = "",
    arguments: Mapping[str, Any] | None = None,
) -> Any:
    if not response.is_success:
        raise ValueError("provider failure")
    if response.status_code == 204:
        return {"success": True}
    if not response.content:
        return {"success": True}
    content_type = response.headers.get("content-type", "")
    if "json" not in content_type:
        if service_id == "google-drive" and tool_name in {
            "gdrive_download_file",
            "gdrive_export_file",
        }:
            inputs = arguments or {}
            return {
                "fileId": inputs.get("file_id"),
                "content": base64.b64encode(response.content).decode(),
                "mimeType": inputs.get("mime_type") or content_type or None,
                "size": len(response.content),
            }
        return {
            "content": base64.b64encode(response.content).decode(),
            "mimeType": content_type or "application/octet-stream",
        }
    payload = response.json()
    if service_id == "slack" and isinstance(payload, Mapping) and payload.get("ok") is not True:
        raise ValueError("provider failure")
    if service_id == "linear" and isinstance(payload, Mapping):
        if payload.get("errors"):
            raise ValueError("provider failure")
        return payload.get("data")
    return payload


def _validated(service_id: str, tool_name: str, arguments: Mapping[str, Any]) -> bool:
    definition = definition_index().get((service_id, tool_name))
    if definition is None:
        return False
    return not list(Draft202012Validator(definition.input_schema).iter_errors(arguments))


def validate_arguments(service_id: str, tool_name: str, arguments: Mapping[str, Any]) -> bool:
    """Validate arguments against the checked-in canonical JSON Schema."""
    return _validated(service_id, tool_name, arguments)


def _prepare(service_id: str, tool_name: str, arguments: Mapping[str, Any]) -> RequestSpec:
    return BUILDERS[service_id](tool_name, arguments)


def execute(
    *,
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    credential: CredentialLease | Mapping[str, Any],
    transport: httpx.BaseTransport | None = None,
    timeout: float = 30.0,
) -> Result[Any]:
    if not _validated(service_id, tool_name, arguments):
        return Result.failure(invalid_tool_input())
    try:
        headers, credential_params = _credential_headers(credential)
        spec = _prepare(service_id, tool_name, arguments)
        headers.update(_provider_headers(service_id, tool_name))
        headers.update(spec.headers)
        with httpx.Client(transport=transport, timeout=timeout) as client:
            if service_id == "jira":
                discovery_headers = {
                    key: value for key, value in headers.items() if key.lower() != "content-type"
                }
                discovery = client.get(
                    "https://api.atlassian.com/oauth/token/accessible-resources",
                    headers=discovery_headers,
                )
                resources = discovery.json()
                cloud = resources[0]["id"]
                spec = RequestSpec(
                    spec.method,
                    spec.url.replace("{cloud}", cloud),
                    spec.params,
                    spec.json_body,
                    spec.content,
                    spec.headers,
                )
            first = client.request(
                spec.method,
                spec.url,
                params=[*spec.params, *credential_params],
                json=spec.json_body,
                content=spec.content,
                headers=headers,
            )
            result = _parse_provider_response(first, service_id, tool_name, arguments)
            if tool_name == "discord_send_dm":
                channel = cast(Mapping[str, Any], result)
                second = client.post(
                    f"https://discord.com/api/v10/channels/{channel['id']}/messages",
                    json={"content": arguments["content"]},
                    headers=headers,
                )
                result = _parse_provider_response(second, service_id)
            if tool_name in {"gmail_read_emails", "gmail_search_emails"} and isinstance(
                result, Mapping
            ):
                messages = []
                for item in result.get("messages", []):
                    response = client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}",
                        params={"format": arguments.get("format", "full")},
                        headers=headers,
                    )
                    messages.append(_parse_provider_response(response, service_id))
                result = {**result, "messages": messages}
        return Result.success(result)
    except Exception:
        return Result.failure(provider_error())


async def aexecute(
    *,
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    credential: CredentialLease | Mapping[str, Any],
    transport: httpx.AsyncBaseTransport | None = None,
    timeout: float = 30.0,
) -> Result[Any]:
    if not _validated(service_id, tool_name, arguments):
        return Result.failure(invalid_tool_input())
    try:
        headers, credential_params = _credential_headers(credential)
        spec = _prepare(service_id, tool_name, arguments)
        headers.update(_provider_headers(service_id, tool_name))
        headers.update(spec.headers)
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            if service_id == "jira":
                discovery_headers = {
                    key: value for key, value in headers.items() if key.lower() != "content-type"
                }
                discovery = await client.get(
                    "https://api.atlassian.com/oauth/token/accessible-resources",
                    headers=discovery_headers,
                )
                cloud = discovery.json()[0]["id"]
                spec = RequestSpec(
                    spec.method,
                    spec.url.replace("{cloud}", cloud),
                    spec.params,
                    spec.json_body,
                    spec.content,
                    spec.headers,
                )
            response = await client.request(
                spec.method,
                spec.url,
                params=[*spec.params, *credential_params],
                json=spec.json_body,
                content=spec.content,
                headers=headers,
            )
            result = _parse_provider_response(response, service_id, tool_name, arguments)
            if tool_name == "discord_send_dm":
                channel = cast(Mapping[str, Any], result)
                second = await client.post(
                    f"https://discord.com/api/v10/channels/{channel['id']}/messages",
                    json={"content": arguments["content"]},
                    headers=headers,
                )
                result = _parse_provider_response(second, service_id)
            if tool_name in {"gmail_read_emails", "gmail_search_emails"} and isinstance(
                result, Mapping
            ):
                messages = []
                for item in result.get("messages", []):
                    detail = await client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}",
                        params={"format": arguments.get("format", "full")},
                        headers=headers,
                    )
                    messages.append(_parse_provider_response(detail, service_id))
                result = {**result, "messages": messages}
        return Result.success(result)
    except Exception:
        return Result.failure(provider_error())


EXECUTOR_REGISTRY = {key: execute for key in definition_index()}
