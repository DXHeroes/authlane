from __future__ import annotations

import base64
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, cast
from urllib.parse import quote, urlsplit

import httpx
from jsonschema import Draft202012Validator

from ._errors import credential_type_unsupported, invalid_tool_input, provider_error
from .contracts import definition_index
from .models import ApiKeyCredentialLease, CredentialLease, OAuthCredentialLease, Result
from .provider_mcp import aexecute_preferred_provider_mcp, execute_preferred_provider_mcp


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
        "microsoft-calendar",
        "microsoft-mail",
        "microsoft-sharepoint",
        "notion",
        "pipedrive",
        "salesforce",
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
    if (service_id == "google-drive" and tool_name in {
        "gdrive_download_file",
        "gdrive_export_file",
    }) or (service_id == "microsoft-sharepoint" and tool_name == "microsoft_sharepoint_download_file"):
        return {}

    headers = {"Content-Type": "application/json"} if service_id in JSON_PROVIDER_SERVICES else {}
    if service_id == "jira":
        headers["Accept"] = "application/json"
    if service_id == "notion":
        headers["Notion-Version"] = "2022-06-28"
    return headers


def _clean(value: Mapping[str, Any], *excluded: str) -> dict[str, Any]:
    return {key: item for key, item in value.items() if key not in excluded and item is not None}


def _js_truthy(value: Any) -> bool:
    """Match JavaScript truthiness used by the TypeScript provider adapters."""
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and value == 0:
        return False
    return not (isinstance(value, str) and value == "")


def _jira_adf(text: Any) -> dict[str, Any]:
    return {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": str(text)}]}],
    }


def _pairs(value: Mapping[str, Any], names: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [
        (
            remote,
            str(value[local]).lower() if isinstance(value.get(local), bool) else str(value[local]),
        )
        for local, remote in names
        if _js_truthy(value.get(local))
    ]


def _email_raw(arguments: Mapping[str, Any]) -> str:
    headers = [
        f"To: {', '.join(cast(list[str], arguments['to']))}",
        f"Subject: {arguments['subject']}",
    ]
    for source, header in (("cc", "Cc"), ("bcc", "Bcc"), ("reply_to", "Reply-To")):
        if arguments.get(source):
            value = arguments[source]
            rendered = ", ".join(value) if isinstance(value, list) else str(value)
            headers.append(f"{header}: {rendered}")
    if arguments.get("html"):
        headers.append("Content-Type: text/html; charset=utf-8")
    message = "\r\n".join([*headers, "", str(arguments["body"])])
    return base64.urlsafe_b64encode(message.encode()).decode().rstrip("=")


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
    if tool == "discord_get_current_user":
        return RequestSpec("GET", f"{root}users/@me")
    if tool == "discord_list_guilds":
        return RequestSpec(
            "GET",
            f"{root}users/@me/guilds",
            params=[
                ("limit", str(max(1, min(a.get("limit", 100), 200)))),
                ("with_counts", str(a.get("with_counts", False)).lower()),
                *_pairs(a, [("before", "before"), ("after", "after")]),
            ],
        )
    if tool == "discord_get_current_user_guild_member":
        return RequestSpec(
            "GET", f"{root}users/@me/guilds/{quote(str(a['guild_id']), safe='')}/member"
        )
    return RequestSpec("GET", f"{root}users/@me/connections")


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
        for optional in ("branch", "sha"):
            if not _js_truthy(body.get(optional)):
                body.pop(optional, None)
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
        if tool == "gmail_send_email":
            if a.get("thread_id"):
                raw_body["threadId"] = a["thread_id"]
            if _js_truthy(a.get("label_ids")):
                raw_body["labelIds"] = a["label_ids"]
        return RequestSpec(
            "POST",
            root + ("/messages/send" if tool == "gmail_send_email" else "/drafts"),
            json_body=raw_body if tool == "gmail_send_email" else {"message": raw_body},
        )
    if tool in {"gmail_read_emails", "gmail_search_emails"}:
        params = (
            [("q", str(a["query"])), ("maxResults", str(a.get("max_results", 10)))]
            if tool == "gmail_search_emails"
            else [("maxResults", str(a.get("max_results", 10)))]
        )
        if _js_truthy(a.get("label_ids")):
            params.append(("labelIds", ",".join(a["label_ids"])))
        if a.get("include_spam_trash"):
            params.append(("includeSpamTrash", "true"))
        if a.get("page_token"):
            params.append(("pageToken", str(a["page_token"])))
        return RequestSpec("GET", root + "/messages", params=params)
    if tool == "gmail_get_email":
        format = str(a.get("format", "full"))
        params = [("format", format)]
        if format == "metadata":
            params += [("metadataHeaders", str(value)) for value in a.get("metadata_headers", [])]
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
                if _js_truthy(a.get(local))
            },
        )
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
        if a.get("background_color") and a.get("text_color"):
            label_body["color"] = _clean(
                {"backgroundColor": a.get("background_color"), "textColor": a.get("text_color")}
            )
        return RequestSpec("POST", root + "/labels", json_body=label_body)
    if tool == "gmail_get_thread":
        format = str(a.get("format", "full"))
        return RequestSpec(
            "GET",
            root + f"/threads/{a['id']}",
            params=[
                ("format", format),
                *(
                    [("metadataHeaders", str(v)) for v in a.get("metadata_headers", [])]
                    if format == "metadata"
                    else []
                ),
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
        body: dict[str, Any] = {}
        for key in (
            "summary",
            "description",
            "location",
            "attendees",
            "reminders",
            "recurrence",
            "visibility",
            "status",
        ):
            if _js_truthy(a.get(key)):
                body[key] = a[key]
        if a.get("color_id"):
            body["colorId"] = a["color_id"]
        for source, target in (("start_time", "start"), ("end_time", "end")):
            if a.get(source):
                timestamp = str(a[source])
                body[target] = (
                    {"date": timestamp}
                    if "T" not in timestamp
                    else {
                        "dateTime": timestamp,
                        **({"timeZone": a["timezone"]} if "timezone" in a else {}),
                    }
                )
        return RequestSpec(
            "POST" if tool == "gcal_create_event" else "PATCH",
            f"{root}/calendars/{calendar_id}/events" + (f"/{event_id}" if event_id else ""),
            params=[("sendUpdates", str(a.get("send_updates", "none")))],
            json_body=body,
        )
    if tool == "gcal_list_events":
        params = [
            ("maxResults", str(a.get("max_results", 10))),
            ("singleEvents", str(a.get("single_events", False)).lower()),
        ]
        params += _pairs(
            a,
            [
                ("time_min", "timeMin"),
                ("time_max", "timeMax"),
                ("page_token", "pageToken"),
                ("order_by", "orderBy"),
            ],
        )
        if a.get("show_deleted"):
            params.append(("showDeleted", "true"))
        params += _pairs(
            a,
            [("q", "q"), ("updated_min", "updatedMin"), ("timezone", "timeZone")],
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
            params=[("sendUpdates", str(a.get("send_updates", "none")))],
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
        params=[
            ("text", str(a["text"])),
            ("sendUpdates", str(a.get("send_updates", "none"))),
        ],
    )


def _gdrive(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://www.googleapis.com/drive/v3"
    file_id = a.get("file_id")
    if tool == "gdrive_list_files":
        query = a.get("query")
        folder = a.get("folder_id")
        final = (
            f"{query} and '{folder}' in parents"
            if query and folder
            else (f"'{folder}' in parents" if folder else query)
        )
        params = [("pageSize", str(a.get("max_results", 10)))]
        final = str(final) if final else ""
        if not a.get("include_trashed", False):
            final = f"{final} and trashed=false" if final else "trashed=false"
        if final:
            params.append(("q", final))
        params += _pairs(a, [("page_token", "pageToken"), ("order_by", "orderBy")])
        if a.get("spaces", "drive"):
            params.append(("spaces", str(a.get("spaces", "drive"))))
        if a.get("fields"):
            params.append(("fields", str(a["fields"])))
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
        export = tool == "gdrive_export_file" or _js_truthy(a.get("mime_type"))
        endpoint = f"{root}/files/{file_id}" + ("/export" if export else "")
        params = [("mimeType", str(a["mime_type"]))] if export else [("alt", "media")]
        if tool == "gdrive_download_file" and a.get("supports_all_drives"):
            params.append(("supportsAllDrives", "true"))
        return RequestSpec("GET", endpoint, params=params)
    if tool == "gdrive_create_folder":
        folder_metadata = {
            "name": a["name"],
            "mimeType": "application/vnd.google-apps.folder",
        }
        if a.get("parent_folder_id"):
            folder_metadata["parents"] = [a["parent_folder_id"]]
        if a.get("description"):
            folder_metadata["description"] = a["description"]
        if a.get("starred"):
            folder_metadata["starred"] = a["starred"]
        return RequestSpec(
            "POST",
            root + "/files",
            params=[("supportsAllDrives", "true")] if a.get("supports_all_drives") else [],
            json_body=folder_metadata,
        )
    if tool == "gdrive_update_file":
        update_metadata = _clean(
            a,
            "file_id",
            "content",
            "mime_type",
            "supports_all_drives",
            "add_parents",
            "remove_parents",
        )
        if not _js_truthy(update_metadata.get("name")):
            update_metadata.pop("name", None)
        params = _pairs(a, [("supports_all_drives", "supportsAllDrives")])
        if _js_truthy(a.get("add_parents")):
            params.append(("addParents", ",".join(a["add_parents"])))
        if _js_truthy(a.get("remove_parents")):
            params.append(("removeParents", ",".join(a["remove_parents"])))
        if a.get("content") and a.get("mime_type"):
            boundary = "-------314159265358979323846"
            content = _gdrive_multipart_content(
                update_metadata, str(a["content"]), str(a["mime_type"]), boundary
            )
            return RequestSpec(
                "PATCH",
                f"https://www.googleapis.com/upload/drive/v3/files/{file_id}",
                params=[("uploadType", "multipart")],
                content=content,
                headers={"Content-Type": f"multipart/related; boundary={boundary}"},
            )
        return RequestSpec(
            "PATCH", f"{root}/files/{file_id}", params=params, json_body=update_metadata
        )
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
        copy_metadata: dict[str, Any] = {}
        if a.get("name"):
            copy_metadata["name"] = a["name"]
        if a.get("parent_folder_id"):
            copy_metadata["parents"] = [a["parent_folder_id"]]
        return RequestSpec(
            "POST",
            f"{root}/files/{file_id}/copy",
            params=_pairs(a, [("supports_all_drives", "supportsAllDrives")]),
            json_body=copy_metadata,
        )
    if tool == "gdrive_search_files":
        params = [
            ("q", str(a["query"])),
            ("pageSize", str(a.get("max_results", 10))),
            ("orderBy", str(a.get("order_by", "modifiedTime desc"))),
            *_pairs(a, [("page_token", "pageToken")]),
        ]
        if a.get("supports_all_drives"):
            params += [("supportsAllDrives", "true"), ("includeItemsFromAllDrives", "true")]
        return RequestSpec("GET", root + "/files", params=params)
    if tool == "gdrive_share_file":
        permission = {"role": a["role"], "type": a["type"]}
        if a.get("email_address"):
            permission["emailAddress"] = a["email_address"]
        if a.get("domain"):
            permission["domain"] = a["domain"]
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
    if a.get("description"):
        metadata["description"] = a["description"]
    if a.get("starred"):
        metadata["starred"] = a["starred"]
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
        if _js_truthy(associations):
            body["associations"] = associations
        return RequestSpec("POST", root + kind, json_body=body)
    if tool in {"hubspot_list_contacts", "hubspot_list_deals"}:
        body = {
            "limit": a.get("limit", 10),
            "archived": a.get("archived", False),
            **{
                key: value
                for key, value in _clean(a, "limit", "archived").items()
                if _js_truthy(value)
            },
        }
        return RequestSpec("POST", root + kind + "/search", json_body=body)
    object_id = a.get("contactId", a.get("dealId"))
    if tool in {"hubspot_get_contact", "hubspot_get_deal"}:
        params: list[tuple[str, str]] = [("archived", str(a.get("archived", False)).lower())]
        if isinstance(a.get("properties"), list):
            params.append(("properties", ",".join(a["properties"])))
        return RequestSpec("GET", root + f"{kind}/{quote(str(object_id), safe='')}", params=params)
    return RequestSpec(
        "PATCH", root + f"{kind}/{object_id}", json_body={"properties": a["properties"]}
    )


def _jira(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://api.atlassian.com/ex/jira/{cloud}/rest/api/3"
    if tool == "jira_create_issue":
        fields: dict[str, Any] = {
            "project": {"key": a["projectKey"]},
            "summary": a["summary"],
            "issuetype": {"name": a["issueType"]},
        }
        if a.get("description"):
            fields["description"] = _jira_adf(a["description"])
        if a.get("priority"):
            fields["priority"] = {"name": a["priority"]}
        if a.get("assigneeAccountId"):
            fields["assignee"] = {"accountId": a["assigneeAccountId"]}
        if _js_truthy(a.get("labels")):
            fields["labels"] = a["labels"]
        if _js_truthy(a.get("components")):
            fields["components"] = [{"name": component} for component in a["components"]]
        if a.get("dueDate"):
            fields["duedate"] = a["dueDate"]
        return RequestSpec("POST", root + "/issue", json_body={"fields": fields})
    if tool == "jira_list_issues":
        params = [
            ("maxResults", str(a.get("maxResults", 50))),
            ("startAt", str(a.get("startAt", 0))),
        ]
        jql = a.get("jql")
        if not jql:
            conditions = []
            if a.get("projectKey"):
                conditions.append(f"project = {a['projectKey']}")
            if a.get("assigneeAccountId"):
                conditions.append(f"assignee = {a['assigneeAccountId']}")
            if a.get("status"):
                conditions.append(f'status = "{a["status"]}"')
            jql = " AND ".join(conditions)
        if jql:
            params.append(("jql", str(jql)))
        if _js_truthy(a.get("fields")):
            params.append(("fields", ",".join(a["fields"])))
        return RequestSpec("GET", root + "/search", params=params)
    key = a.get("issueKey")
    if tool == "jira_get_transitions":
        return RequestSpec("GET", root + f"/issue/{key}/transitions")
    if tool == "jira_transition_issue":
        transition_id = a.get("transitionId")
        if not transition_id and not a.get("transitionName"):
            raise ValueError("transitionId or transitionName is required")
        body: dict[str, Any] = {"transition": {"id": transition_id or "{transition}"}}
        transition_fields: dict[str, Any] = {}
        if a.get("assigneeAccountId"):
            transition_fields["assignee"] = {"accountId": a["assigneeAccountId"]}
        if a.get("resolution"):
            transition_fields["resolution"] = {"name": a["resolution"]}
        if transition_fields:
            body["fields"] = transition_fields
        if a.get("comment"):
            body["update"] = {"comment": [{"add": {"body": _jira_adf(a["comment"])}}]}
        return RequestSpec("POST", root + f"/issue/{key}/transitions", json_body=body)
    if tool == "jira_update_issue":
        fields = {}
        if a.get("summary"):
            fields["summary"] = a["summary"]
        if a.get("description"):
            fields["description"] = _jira_adf(a["description"])
        if a.get("priority"):
            fields["priority"] = {"name": a["priority"]}
        if a.get("assigneeAccountId"):
            fields["assignee"] = (
                None if a["assigneeAccountId"] == "null" else {"accountId": a["assigneeAccountId"]}
            )
        if _js_truthy(a.get("labels")):
            fields["labels"] = a["labels"]
        if a.get("dueDate"):
            fields["duedate"] = a["dueDate"]
        return RequestSpec("PUT", root + f"/issue/{key}", json_body={"fields": fields})
    body = {"body": _jira_adf(a["comment"])}
    return RequestSpec("POST", root + f"/issue/{key}/comment", json_body=body)


def _linear(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    if tool == "linear_create_issue":
        query = (
            "\n        mutation IssueCreate($input: IssueCreateInput!) {\n"
            "          issueCreate(input: $input) {\n"
            "            success\n"
            "            issue {\n"
            "              id\n              identifier\n              title\n              url\n"
            "            }\n          }\n        }\n      "
        )
        input: dict[str, Any] = {"title": a["title"], "teamId": a["teamId"]}
        for key in ("description", "assigneeId", "labelIds"):
            if _js_truthy(a.get(key)):
                input[key] = a[key]
        if "priority" in a and a["priority"] is not None:
            input["priority"] = a["priority"]
        variables: dict[str, Any] | None = {"input": input}
    elif tool == "linear_update_issue":
        query = (
            "\n        mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {\n"
            "          issueUpdate(id: $id, input: $input) {\n"
            "            success\n"
            "            issue {\n"
            "              id\n              identifier\n              title\n              url\n"
            "            }\n          }\n        }\n      "
        )
        input = {}
        for key in ("title", "description", "assigneeId", "stateId"):
            if a.get(key):
                input[key] = a[key]
        if "priority" in a and a["priority"] is not None:
            input["priority"] = a["priority"]
        variables = {"id": a["issueId"], "input": input}
    elif tool == "linear_create_project":
        query = (
            "\n        mutation ProjectCreate($input: ProjectCreateInput!) {\n"
            "          projectCreate(input: $input) {\n"
            "            success\n"
            "            project {\n"
            "              id\n              name\n              url\n"
            "            }\n          }\n        }\n      "
        )
        input = {"name": a["name"], "teamIds": a["teamIds"]}
        for key in ("description", "leadId", "targetDate"):
            if a.get(key):
                input[key] = a[key]
        variables = {"input": input}
    elif tool == "linear_list_issues":
        filters = []
        if a.get("teamId"):
            filters.append(f'team: {{ id: {{ eq: "{a["teamId"]}" }} }}')
        if a.get("assigneeId"):
            filters.append(f'assignee: {{ id: {{ eq: "{a["assigneeId"]}" }} }}')
        filter_string = f"filter: {{ {', '.join(filters)} }}" if filters else ""
        query = (
            "\n        query Issues {\n"
            f"          issues({filter_string}, first: {min(a.get('limit', 50), 250)}) {{\n"
            "            nodes {\n"
            "              id\n              identifier\n              title\n"
            "              description\n              priority\n"
            "              state {\n                name\n                type\n              }\n"
            "              assignee {\n                id\n                name\n"
            "                email\n              }\n"
            "              team {\n                id\n                name\n              }\n"
            "              url\n              createdAt\n              updatedAt\n"
            "            }\n          }\n        }\n      "
        )
        variables = None
    else:
        filter_string = (
            f'filter: {{ team: {{ id: {{ eq: "{a["teamId"]}" }} }} }}' if a.get("teamId") else ""
        )
        query = (
            "\n        query Projects {\n"
            f"          projects({filter_string}, first: {min(a.get('limit', 50), 250)}) {{\n"
            "            nodes {\n"
            "              id\n              name\n              description\n"
            "              state\n              priority\n              progress\n"
            "              targetDate\n"
            "              lead {\n                id\n                name\n              }\n"
            "              teams {\n                nodes {\n                  id\n"
            "                  name\n                }\n              }\n"
            "              url\n              createdAt\n              updatedAt\n"
            "            }\n          }\n        }\n      "
        )
        variables = None
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
            json_body={
                key: value for key, value in _clean(a, "database_id").items() if _js_truthy(value)
            },
        )
    if tool == "notion_update_page":
        return RequestSpec("PATCH", root + f"/pages/{a['page_id']}", json_body=_clean(a, "page_id"))
    if tool == "notion_get_page":
        return RequestSpec(
            "GET",
            root + f"/pages/{a['page_id']}",
            params=(
                [("filter_properties", ",".join(a["filter_properties"]))]
                if _js_truthy(a.get("filter_properties"))
                else []
            ),
        )
    if tool == "notion_get_database":
        return RequestSpec("GET", root + f"/databases/{a['database_id']}")
    if tool in {"notion_list_databases", "notion_search"}:
        search_body = {key: value for key, value in _clean(a).items() if _js_truthy(value)}
        if tool == "notion_list_databases":
            search_body["filter"] = {"property": "object", "value": "database"}
        return RequestSpec("POST", root + "/search", json_body=search_body)
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
        block_body: dict[str, Any] = {}
        if "archived" in a and a["archived"] is not None:
            block_body["archived"] = a["archived"]
        if a.get("content"):
            block_body.update(cast(Mapping[str, Any], a["content"]))
        return RequestSpec("PATCH", root + f"/blocks/{a['block_id']}", json_body=block_body)
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
        ]
        if tool == "pipedrive_list_deals":
            params.append(("status", str(a.get("status", "all_not_deleted"))))
            params += _pairs(
                a,
                [
                    ("user_id", "user_id"),
                    ("filter_id", "filter_id"),
                    ("stage_id", "stage_id"),
                    ("sort", "sort"),
                ],
            )
            if a.get("owned_by_you"):
                params.append(("owned_by_you", "1"))
        else:
            params += _pairs(
                a,
                [
                    ("user_id", "user_id"),
                    ("filter_id", "filter_id"),
                    ("first_char", "first_char"),
                    ("sort", "sort"),
                ],
            )
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
    if _js_truthy(a.get("item_types")):
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


def _slack(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    root = "https://slack.com/api/"
    if tool == "slack_send_message":
        return RequestSpec(
            "POST",
            root + "chat.postMessage",
            json_body={key: value for key, value in a.items() if _js_truthy(value)},
        )
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
    optional = (
        [("starting_after", "starting_after"), ("email", "email")]
        if tool == "stripe_list_customers"
        else [("starting_after", "starting_after"), ("customer", "customer")]
    )
    params = [("limit", str(min(a.get("limit", 10), 100))), *_pairs(a, optional)]
    return RequestSpec("GET", root + kind, params=params)


GRAPH_ROOT = "https://graph.microsoft.com/v1.0"
GRAPH_MAX_FILE_BYTES = 4 * 1024 * 1024


def _graph_id(value: Any) -> str:
    return quote(str(value), safe="")


def _graph_limit(value: Mapping[str, Any]) -> str:
    return str(max(1, min(int(value.get("limit", 25)), 100)))


def _graph_cursor(value: Mapping[str, Any], expected_path: str) -> str | None:
    cursor = value.get("cursor")
    if cursor is None:
        return None
    if not isinstance(cursor, str) or not 0 < len(cursor) <= 8_192:
        raise ValueError("invalid cursor")
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode()
        parsed = urlsplit(decoded)
    except (ValueError, UnicodeDecodeError):
        raise ValueError("invalid cursor") from None
    if (
        parsed.scheme != "https"
        or parsed.hostname != "graph.microsoft.com"
        or parsed.port not in {None, 443}
        or parsed.path != f"/v1.0{expected_path}"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise ValueError("invalid cursor")
    return decoded


def _graph_recipients(addresses: list[str]) -> list[dict[str, dict[str, str]]]:
    return [{"emailAddress": {"address": address}} for address in addresses]


def _microsoft_message(a: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "subject": a["subject"],
        "body": {
            "contentType": "HTML" if a.get("body_type") == "html" else "Text",
            "content": a["body"],
        },
        "toRecipients": _graph_recipients(cast(list[str], a["to"])),
    }
    if "cc" in a:
        result["ccRecipients"] = _graph_recipients(cast(list[str], a["cc"]))
    if "bcc" in a:
        result["bccRecipients"] = _graph_recipients(cast(list[str], a["bcc"]))
    return result


def _microsoft_mail(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    if tool == "microsoft_mail_list_messages":
        folder_id = _graph_id(a.get("folder_id", "inbox"))
        path = f"/me/mailFolders/{folder_id}/messages"
        cursor = _graph_cursor(a, path)
        return RequestSpec("GET", cursor or GRAPH_ROOT + path, params=[] if cursor else [("$top", _graph_limit(a))])
    if tool == "microsoft_mail_search_messages":
        folder_id_value = a.get("folder_id")
        path = (
            f"/me/mailFolders/{_graph_id(folder_id_value)}/messages"
            if folder_id_value
            else "/me/messages"
        )
        cursor = _graph_cursor(a, path)
        escaped = str(a["query"]).replace('"', '\\"')
        return RequestSpec(
            "GET",
            cursor or GRAPH_ROOT + path,
            params=[] if cursor else [("$search", f'"{escaped}"'), ("$top", _graph_limit(a))],
        )
    if tool == "microsoft_mail_get_message":
        return RequestSpec("GET", f"{GRAPH_ROOT}/me/messages/{_graph_id(a['message_id'])}")
    if tool == "microsoft_mail_list_folders":
        parent = a.get("parent_folder_id")
        path = f"/me/mailFolders/{_graph_id(parent)}/childFolders" if parent else "/me/mailFolders"
        cursor = _graph_cursor(a, path)
        return RequestSpec("GET", cursor or GRAPH_ROOT + path, params=[] if cursor else [("$top", _graph_limit(a))])
    if tool == "microsoft_mail_list_attachments":
        return RequestSpec("GET", f"{GRAPH_ROOT}/me/messages/{_graph_id(a['message_id'])}/attachments")
    if tool == "microsoft_mail_get_attachment":
        return RequestSpec(
            "GET",
            f"{GRAPH_ROOT}/me/messages/{_graph_id(a['message_id'])}/attachments/{_graph_id(a['attachment_id'])}",
        )
    if tool == "microsoft_mail_create_draft":
        return RequestSpec("POST", f"{GRAPH_ROOT}/me/messages", json_body=_microsoft_message(a))
    if tool == "microsoft_mail_update_message":
        body: dict[str, Any] = {}
        if "is_read" in a:
            body["isRead"] = a["is_read"]
        if "categories" in a:
            body["categories"] = a["categories"]
        if "subject" in a:
            body["subject"] = a["subject"]
        if "body" in a:
            body["body"] = {
                "contentType": "HTML" if a.get("body_type") == "html" else "Text",
                "content": a["body"],
            }
        if not body:
            raise ValueError("missing update")
        return RequestSpec("PATCH", f"{GRAPH_ROOT}/me/messages/{_graph_id(a['message_id'])}", json_body=body)
    if tool == "microsoft_mail_send_message":
        return RequestSpec(
            "POST",
            f"{GRAPH_ROOT}/me/sendMail",
            json_body={"message": _microsoft_message(a), "saveToSentItems": True},
        )
    message = _graph_id(a["message_id"])
    if tool == "microsoft_mail_send_draft":
        return RequestSpec("POST", f"{GRAPH_ROOT}/me/messages/{message}/send", json_body={})
    if tool == "microsoft_mail_reply_to_message":
        return RequestSpec("POST", f"{GRAPH_ROOT}/me/messages/{message}/reply", json_body={"comment": a["comment"]})
    if tool == "microsoft_mail_forward_message":
        return RequestSpec(
            "POST",
            f"{GRAPH_ROOT}/me/messages/{message}/forward",
            json_body={
                "comment": a.get("comment", ""),
                "toRecipients": _graph_recipients(cast(list[str], a["to"])),
            },
        )
    if tool == "microsoft_mail_move_message":
        return RequestSpec(
            "POST",
            f"{GRAPH_ROOT}/me/messages/{message}/move",
            json_body={"destinationId": a["destination_folder_id"]},
        )
    return RequestSpec("DELETE", f"{GRAPH_ROOT}/me/messages/{message}")


def _calendar_collection(a: Mapping[str, Any], suffix: str) -> str:
    calendar = a.get("calendar_id")
    return f"/me/calendars/{_graph_id(calendar)}/{suffix}" if calendar else f"/me/{suffix}"


def _microsoft_event(a: Mapping[str, Any], partial: bool = False) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if not partial or "subject" in a:
        body["subject"] = a["subject"]
    if "body" in a:
        body["body"] = {
            "contentType": "HTML" if a.get("body_type") == "html" else "Text",
            "content": a["body"],
        }
    timezone = a.get("timezone", "UTC")
    if not partial or "start_time" in a:
        body["start"] = {"dateTime": a["start_time"], "timeZone": timezone}
    if not partial or "end_time" in a:
        body["end"] = {"dateTime": a["end_time"], "timeZone": timezone}
    if "location" in a:
        body["location"] = {"displayName": a["location"]}
    if "attendees" in a:
        body["attendees"] = [
            {"emailAddress": {"address": address}, "type": "required"}
            for address in cast(list[str], a["attendees"])
        ]
    if "is_online_meeting" in a:
        body["isOnlineMeeting"] = a["is_online_meeting"]
        if a["is_online_meeting"]:
            body["onlineMeetingProvider"] = "teamsForBusiness"
    return body


def _calendar_event_path(a: Mapping[str, Any]) -> str:
    event = _graph_id(a["event_id"])
    calendar = a.get("calendar_id")
    return f"/me/calendars/{_graph_id(calendar)}/events/{event}" if calendar else f"/me/events/{event}"


def _microsoft_calendar(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    if tool == "microsoft_calendar_list_calendars":
        path = "/me/calendars"
        cursor = _graph_cursor(a, path)
        return RequestSpec("GET", cursor or GRAPH_ROOT + path, params=[] if cursor else [("$top", _graph_limit(a))])
    if tool == "microsoft_calendar_list_events":
        path = _calendar_collection(a, "events")
        cursor = _graph_cursor(a, path)
        return RequestSpec("GET", cursor or GRAPH_ROOT + path, params=[] if cursor else [("$top", _graph_limit(a))])
    if tool == "microsoft_calendar_get_event":
        return RequestSpec("GET", GRAPH_ROOT + _calendar_event_path(a))
    if tool == "microsoft_calendar_get_calendar_view":
        path = _calendar_collection(a, "calendarView")
        cursor = _graph_cursor(a, path)
        return RequestSpec(
            "GET",
            cursor or GRAPH_ROOT + path,
            params=[] if cursor else [
                ("startDateTime", str(a["start_time"])),
                ("endDateTime", str(a["end_time"])),
                ("$top", _graph_limit(a)),
            ],
        )
    if tool == "microsoft_calendar_get_schedule":
        return RequestSpec(
            "POST",
            f"{GRAPH_ROOT}/me/calendar/getSchedule",
            json_body={
                "schedules": a["schedules"],
                "startTime": {"dateTime": a["start_time"], "timeZone": a.get("timezone", "UTC")},
                "endTime": {"dateTime": a["end_time"], "timeZone": a.get("timezone", "UTC")},
                "availabilityViewInterval": a.get("interval_minutes", 30),
            },
        )
    if tool == "microsoft_calendar_create_calendar":
        return RequestSpec("POST", f"{GRAPH_ROOT}/me/calendars", json_body={"name": a["name"]})
    if tool == "microsoft_calendar_update_calendar":
        body = _clean(a, "calendar_id")
        if not body:
            raise ValueError("missing update")
        return RequestSpec("PATCH", f"{GRAPH_ROOT}/me/calendars/{_graph_id(a['calendar_id'])}", json_body=body)
    if tool == "microsoft_calendar_delete_calendar":
        return RequestSpec("DELETE", f"{GRAPH_ROOT}/me/calendars/{_graph_id(a['calendar_id'])}")
    if tool == "microsoft_calendar_create_event":
        return RequestSpec("POST", GRAPH_ROOT + _calendar_collection(a, "events"), json_body=_microsoft_event(a))
    if tool == "microsoft_calendar_update_event":
        body = _microsoft_event(a, True)
        if not body:
            raise ValueError("missing update")
        return RequestSpec("PATCH", GRAPH_ROOT + _calendar_event_path(a), json_body=body)
    event = _graph_id(a["event_id"])
    if tool == "microsoft_calendar_respond_to_event":
        response = str(a["response"])
        if response not in {"accept", "tentativelyAccept", "decline"}:
            raise ValueError("invalid response")
        return RequestSpec(
            "POST",
            f"{GRAPH_ROOT}/me/events/{event}/{response}",
            json_body={"comment": a.get("comment", ""), "sendResponse": a.get("send_response", True)},
        )
    if tool == "microsoft_calendar_cancel_event":
        return RequestSpec("POST", f"{GRAPH_ROOT}/me/events/{event}/cancel", json_body={"comment": a.get("comment", "")})
    return RequestSpec("DELETE", GRAPH_ROOT + _calendar_event_path(a))


def _sharepoint_item(a: Mapping[str, Any]) -> str:
    return f"/drives/{_graph_id(a['drive_id'])}/items/{_graph_id(a['item_id'])}"


def _microsoft_sharepoint(tool: str, a: Mapping[str, Any]) -> RequestSpec:
    if tool == "microsoft_sharepoint_search_sites":
        return RequestSpec("GET", f"{GRAPH_ROOT}/sites", params=[("search", str(a["query"]))])
    if tool == "microsoft_sharepoint_get_site":
        return RequestSpec("GET", f"{GRAPH_ROOT}/sites/{_graph_id(a['site_id'])}")
    if tool == "microsoft_sharepoint_list_drives":
        return RequestSpec("GET", f"{GRAPH_ROOT}/sites/{_graph_id(a['site_id'])}/drives")
    if tool == "microsoft_sharepoint_get_drive":
        return RequestSpec("GET", f"{GRAPH_ROOT}/drives/{_graph_id(a['drive_id'])}")
    if tool == "microsoft_sharepoint_list_items":
        path = f"/drives/{_graph_id(a['drive_id'])}/items/{_graph_id(a.get('parent_item_id', 'root'))}/children"
        cursor = _graph_cursor(a, path)
        return RequestSpec("GET", cursor or GRAPH_ROOT + path, params=[] if cursor else [("$top", _graph_limit(a))])
    if tool == "microsoft_sharepoint_get_item":
        return RequestSpec("GET", GRAPH_ROOT + _sharepoint_item(a))
    if tool == "microsoft_sharepoint_download_file":
        return RequestSpec("GET", GRAPH_ROOT + _sharepoint_item(a) + "/content")
    if tool == "microsoft_sharepoint_list_permissions":
        return RequestSpec("GET", GRAPH_ROOT + _sharepoint_item(a) + "/permissions")
    if tool == "microsoft_sharepoint_create_folder":
        parent = _graph_id(a.get("parent_item_id", "root"))
        behavior = a.get("conflict_behavior", "fail")
        return RequestSpec(
            "POST",
            f"{GRAPH_ROOT}/drives/{_graph_id(a['drive_id'])}/items/{parent}/children",
            json_body={
                "name": a["folder_name"],
                "folder": {},
                "@microsoft.graph.conflictBehavior": behavior,
            },
        )
    if tool == "microsoft_sharepoint_upload_file":
        try:
            content = base64.b64decode(str(a["content_base64"]), validate=True)
        except ValueError:
            raise ValueError("invalid file") from None
        if not 0 < len(content) <= GRAPH_MAX_FILE_BYTES:
            raise ValueError("invalid file")
        parent = _graph_id(a.get("parent_item_id", "root"))
        return RequestSpec(
            "PUT",
            f"{GRAPH_ROOT}/drives/{_graph_id(a['drive_id'])}/items/{parent}:/{_graph_id(a['file_name'])}:/content",
            content=content,
            headers={"Content-Type": "application/octet-stream"},
        )
    if tool == "microsoft_sharepoint_update_item":
        return RequestSpec("PATCH", GRAPH_ROOT + _sharepoint_item(a), json_body={"name": a["name"]})
    if tool in {"microsoft_sharepoint_move_item", "microsoft_sharepoint_copy_item"}:
        body = {"parentReference": {"id": a["destination_parent_item_id"]}}
        if "name" in a:
            body["name"] = a["name"]
        suffix = "/copy" if tool == "microsoft_sharepoint_copy_item" else ""
        method = "POST" if suffix else "PATCH"
        return RequestSpec(method, GRAPH_ROOT + _sharepoint_item(a) + suffix, json_body=body)
    if tool == "microsoft_sharepoint_create_sharing_link":
        return RequestSpec(
            "POST",
            GRAPH_ROOT + _sharepoint_item(a) + "/createLink",
            json_body={"type": a["link_type"], "scope": a["scope"]},
        )
    if tool == "microsoft_sharepoint_invite_users":
        return RequestSpec(
            "POST",
            GRAPH_ROOT + _sharepoint_item(a) + "/invite",
            json_body={
                "recipients": [{"email": email} for email in cast(list[str], a["recipients"])],
                "roles": a["roles"],
                "message": a.get("message", ""),
                "requireSignIn": a.get("require_sign_in", True),
                "sendInvitation": a.get("send_invitation", True),
            },
        )
    if tool == "microsoft_sharepoint_delete_permission":
        return RequestSpec(
            "DELETE",
            GRAPH_ROOT + _sharepoint_item(a) + f"/permissions/{_graph_id(a['permission_id'])}",
        )
    return RequestSpec("DELETE", GRAPH_ROOT + _sharepoint_item(a))


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
    "microsoft-calendar": _microsoft_calendar,
    "microsoft-mail": _microsoft_mail,
    "microsoft-sharepoint": _microsoft_sharepoint,
    "notion": _notion,
    "pipedrive": _pipedrive,
    "salesforce": _salesforce,
    "slack": _slack,
    "stripe": _stripe,
}

DIRECT_PIPEDRIVE_TOOLS = frozenset(
    {
        "pipedrive_create_deal",
        "pipedrive_list_deals",
        "pipedrive_get_deal",
        "pipedrive_update_deal",
        "pipedrive_add_contact",
        "pipedrive_list_contacts",
        "pipedrive_get_contact",
        "pipedrive_update_contact",
        "pipedrive_search",
    }
)
# Services whose tools exist only on the provider's own MCP server. Mirrors
# allowDirectFallback: false in packages/ai/src/provider-mcp.ts; the TypeScript parity fixture
# fails if the two drift.
MCP_ONLY_TOOL_KEYS = frozenset(
    key
    for key in definition_index()
    if key[0] in ("attio", "github")
    or (key[0] == "pipedrive" and key[1] not in DIRECT_PIPEDRIVE_TOOLS)
)

FORWARD_UNKNOWN_ARGUMENT_TOOLS = frozenset(
    {
        ("hubspot", "hubspot_create_contact"),
        ("hubspot", "hubspot_create_deal"),
        ("pipedrive", "pipedrive_create_deal"),
        ("pipedrive", "pipedrive_update_deal"),
        ("pipedrive", "pipedrive_add_contact"),
        ("pipedrive", "pipedrive_update_contact"),
        ("salesforce", "salesforce_create_contact"),
        ("salesforce", "salesforce_update_opportunity"),
        ("salesforce", "salesforce_create_opportunity"),
    }
)


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


def _is_oauth_credential(credential: CredentialLease | Mapping[str, Any]) -> bool:
    if isinstance(credential, OAuthCredentialLease):
        return True
    if isinstance(credential, ApiKeyCredentialLease):
        return False
    return credential.get("type") == "oauth2"


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
        if service_id == "microsoft-sharepoint" and tool_name == "microsoft_sharepoint_download_file":
            if len(response.content) > GRAPH_MAX_FILE_BYTES:
                raise ValueError("provider file too large")
            return {
                "contentBase64": base64.b64encode(response.content).decode(),
                "contentType": content_type or "application/octet-stream",
                "size": len(response.content),
            }
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
    if service_id.startswith("microsoft-") and isinstance(payload, Mapping):
        result = dict(payload)
        next_link = result.pop("@odata.nextLink", None)
        if isinstance(next_link, str):
            result["nextCursor"] = base64.urlsafe_b64encode(next_link.encode()).decode().rstrip("=")
        return result
    if service_id == "github" and tool_name == "github_get_file" and isinstance(payload, Mapping):
        content = payload.get("content")
        if isinstance(content, str):
            return {
                **payload,
                "decodedContent": base64.b64decode(content.replace("\n", "")).decode(),
            }
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


def _declared_arguments(
    service_id: str, tool_name: str, arguments: Mapping[str, Any]
) -> dict[str, Any]:
    if (service_id, tool_name) in FORWARD_UNKNOWN_ARGUMENT_TOOLS:
        return dict(arguments)
    definition = definition_index()[(service_id, tool_name)]
    additional_properties = definition.input_schema.get("additionalProperties")
    if additional_properties is True or isinstance(additional_properties, Mapping):
        return dict(arguments)
    properties = cast(Mapping[str, Any], definition.input_schema.get("properties", {}))
    return {key: value for key, value in arguments.items() if key in properties}


def validate_arguments(service_id: str, tool_name: str, arguments: Mapping[str, Any]) -> bool:
    """Validate arguments against the checked-in canonical JSON Schema."""
    return _validated(service_id, tool_name, arguments)


def _provider_api_base_url(
    service_id: str, credential: CredentialLease | Mapping[str, Any]
) -> str | None:
    if service_id not in {"pipedrive", "salesforce"}:
        return None
    if isinstance(credential, OAuthCredentialLease):
        value = credential.provider_context.api_base_url if credential.provider_context else None
    elif isinstance(credential, Mapping):
        context = credential.get("providerContext")
        value = context.get("apiBaseUrl") if isinstance(context, Mapping) else None
    else:
        value = None
    if not isinstance(value, str):
        raise ValueError("missing provider routing context")
    parsed = urlsplit(value)
    expected_suffix = ".pipedrive.com" if service_id == "pipedrive" else ".salesforce.com"
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(expected_suffix)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in {None, 443}
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("invalid provider routing context")
    return f"https://{parsed.hostname}"


def _prepare(
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    credential: CredentialLease | Mapping[str, Any],
) -> RequestSpec:
    spec = BUILDERS[service_id](tool_name, arguments)
    provider_base_url = _provider_api_base_url(service_id, credential)
    if provider_base_url:
        placeholder = (
            "https://api.pipedrive.com"
            if service_id == "pipedrive"
            else "https://na1.salesforce.com"
        )
        return RequestSpec(
            spec.method,
            spec.url.replace(placeholder, provider_base_url, 1),
            spec.params,
            spec.json_body,
            spec.content,
            spec.headers,
        )
    return spec


def execute(
    *,
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    credential: CredentialLease | Mapping[str, Any],
    transport: httpx.BaseTransport | None = None,
    mcp_transport: httpx.BaseTransport | None = None,
    provider_mcp: bool = True,
    timeout: float = 30.0,
) -> Result[Any]:
    if not _validated(service_id, tool_name, arguments):
        return Result.failure(invalid_tool_input())
    if (service_id, tool_name) in definition_index() and not _is_oauth_credential(credential):
        return Result.failure(credential_type_unsupported())
    try:
        arguments = _declared_arguments(service_id, tool_name, arguments)
        mcp_only = (service_id, tool_name) in MCP_ONLY_TOOL_KEYS
        if provider_mcp and (mcp_transport is not None or transport is None or mcp_only):
            mcp_attempt = execute_preferred_provider_mcp(
                service_id=service_id,
                tool_name=tool_name,
                arguments=arguments,
                credential=credential,
                transport=mcp_transport,
                timeout=timeout,
            )
            if mcp_attempt.status == "completed":
                return (
                    Result.failure(provider_error())
                    if mcp_attempt.failed
                    else Result.success(mcp_attempt.data)
                )
        if mcp_only:
            return Result.failure(provider_error())
        headers, credential_params = _credential_headers(credential)
        spec = _prepare(service_id, tool_name, arguments, credential)
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
                if tool_name == "jira_transition_issue" and not arguments.get("transitionId"):
                    transitions_response = client.get(spec.url, headers=headers)
                    transitions_payload = _parse_provider_response(
                        transitions_response, service_id, "jira_get_transitions", arguments
                    )
                    transitions = cast(Mapping[str, Any], transitions_payload).get(
                        "transitions", []
                    )
                    requested_name = str(arguments["transitionName"]).lower()
                    transition = next(
                        (
                            item
                            for item in transitions
                            if str(item.get("name", "")).lower() == requested_name
                        ),
                        None,
                    )
                    if transition is None:
                        raise ValueError("transition not found")
                    body = cast(dict[str, Any], spec.json_body)
                    body["transition"] = {"id": transition["id"]}
            first = client.request(
                spec.method,
                spec.url,
                params=[*spec.params, *credential_params],
                json=spec.json_body,
                content=spec.content,
                headers=headers,
            )
            result = _parse_provider_response(first, service_id, tool_name, arguments)
            if tool_name in {"gmail_read_emails", "gmail_search_emails"} and isinstance(
                result, Mapping
            ):
                messages = []
                for item in result.get("messages", []):
                    detail_params: list[tuple[str, str | int | float | bool | None]] = [
                        ("format", str(arguments.get("format", "full")))
                    ]
                    if arguments.get("format") == "metadata":
                        detail_params += [
                            ("metadataHeaders", str(header))
                            for header in arguments.get("metadata_headers", [])
                        ]
                    response = client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}",
                        params=httpx.QueryParams(detail_params),
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
    mcp_transport: httpx.AsyncBaseTransport | None = None,
    provider_mcp: bool = True,
    timeout: float = 30.0,
) -> Result[Any]:
    if not _validated(service_id, tool_name, arguments):
        return Result.failure(invalid_tool_input())
    if (service_id, tool_name) in definition_index() and not _is_oauth_credential(credential):
        return Result.failure(credential_type_unsupported())
    try:
        arguments = _declared_arguments(service_id, tool_name, arguments)
        mcp_only = (service_id, tool_name) in MCP_ONLY_TOOL_KEYS
        if provider_mcp and (mcp_transport is not None or transport is None or mcp_only):
            mcp_attempt = await aexecute_preferred_provider_mcp(
                service_id=service_id,
                tool_name=tool_name,
                arguments=arguments,
                credential=credential,
                transport=mcp_transport,
                timeout=timeout,
            )
            if mcp_attempt.status == "completed":
                return (
                    Result.failure(provider_error())
                    if mcp_attempt.failed
                    else Result.success(mcp_attempt.data)
                )
        if mcp_only:
            return Result.failure(provider_error())
        headers, credential_params = _credential_headers(credential)
        spec = _prepare(service_id, tool_name, arguments, credential)
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
                if tool_name == "jira_transition_issue" and not arguments.get("transitionId"):
                    transitions_response = await client.get(spec.url, headers=headers)
                    transitions_payload = _parse_provider_response(
                        transitions_response, service_id, "jira_get_transitions", arguments
                    )
                    transitions = cast(Mapping[str, Any], transitions_payload).get(
                        "transitions", []
                    )
                    requested_name = str(arguments["transitionName"]).lower()
                    transition = next(
                        (
                            item
                            for item in transitions
                            if str(item.get("name", "")).lower() == requested_name
                        ),
                        None,
                    )
                    if transition is None:
                        raise ValueError("transition not found")
                    body = cast(dict[str, Any], spec.json_body)
                    body["transition"] = {"id": transition["id"]}
            response = await client.request(
                spec.method,
                spec.url,
                params=[*spec.params, *credential_params],
                json=spec.json_body,
                content=spec.content,
                headers=headers,
            )
            result = _parse_provider_response(response, service_id, tool_name, arguments)
            if tool_name in {"gmail_read_emails", "gmail_search_emails"} and isinstance(
                result, Mapping
            ):
                messages = []
                for item in result.get("messages", []):
                    detail_params: list[tuple[str, str | int | float | bool | None]] = [
                        ("format", str(arguments.get("format", "full")))
                    ]
                    if arguments.get("format") == "metadata":
                        detail_params += [
                            ("metadataHeaders", str(header))
                            for header in arguments.get("metadata_headers", [])
                        ]
                    detail = await client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}",
                        params=httpx.QueryParams(detail_params),
                        headers=headers,
                    )
                    messages.append(_parse_provider_response(detail, service_id))
                result = {**result, "messages": messages}
        return Result.success(result)
    except Exception:
        return Result.failure(provider_error())


EXECUTOR_REGISTRY = {key: execute for key in definition_index()}
