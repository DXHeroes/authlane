from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from .models import CredentialLease, OAuthCredentialLease

MCP_PROTOCOL_VERSION = "2025-06-18"


@dataclass(frozen=True, slots=True)
class ProviderMcpPolicy:
    endpoint: str
    prefixes: tuple[str, ...]
    required_scope: str | None = None
    allow_direct_fallback: bool = True
    mapped_tools: tuple[str, ...] = ()


POLICIES: dict[str, ProviderMcpPolicy] = {
    "airtable": ProviderMcpPolicy(
        "https://mcp.airtable.com/mcp",
        ("airtable_",),
        mapped_tools=(
            "airtable_list_bases",
            "airtable_get_base_schema",
            "airtable_get_table_schema",
        ),
    ),
    "attio": ProviderMcpPolicy(
        "https://mcp.attio.com/mcp", ("attio_",), allow_direct_fallback=False
    ),
    "github": ProviderMcpPolicy(
        "https://api.githubcopilot.com/mcp/",
        ("github_",),
        mapped_tools=(
            "github_create_issue",
            "github_list_issues",
            "github_get_file",
            "github_create_file",
            "github_search_code",
            "github_list_pull_requests",
        ),
    ),
    "gmail": ProviderMcpPolicy(
        "https://gmailmcp.googleapis.com/mcp/v1",
        ("gmail_",),
        mapped_tools=(
            "gmail_create_draft",
            "gmail_create_label",
            "gmail_get_thread",
            "gmail_list_drafts",
            "gmail_list_labels",
            "gmail_modify_email",
        ),
    ),
    "google-calendar": ProviderMcpPolicy(
        "https://calendarmcp.googleapis.com/mcp/v1",
        ("gcal_", "google_calendar_"),
        mapped_tools=(
            "gcal_create_event",
            "gcal_list_events",
            "gcal_update_event",
            "gcal_get_event",
            "gcal_delete_event",
            "gcal_list_calendars",
        ),
    ),
    "google-drive": ProviderMcpPolicy(
        "https://drivemcp.googleapis.com/mcp/v1",
        ("gdrive_", "google_drive_"),
        mapped_tools=(
            "gdrive_get_file",
            "gdrive_upload_file",
            "gdrive_create_folder",
            "gdrive_download_file",
            "gdrive_copy_file",
            "gdrive_search_files",
            "gdrive_list_permissions",
        ),
    ),
    "hubspot": ProviderMcpPolicy(
        "https://mcp.hubspot.com", ("hubspot_",), allow_direct_fallback=False
    ),
    "jira": ProviderMcpPolicy(
        "https://mcp.atlassian.com/v1/mcp/authv2",
        ("jira_",),
        mapped_tools=("jira_create_issue", "jira_list_issues"),
    ),
    "linear": ProviderMcpPolicy("https://mcp.linear.app/mcp", ("linear_",)),
    "pipedrive": ProviderMcpPolicy(
        "https://mcp.pipedrive.ai/mcp",
        ("pipedrive_",),
        mapped_tools=(
            "pipedrive_create_deal",
            "pipedrive_list_deals",
            "pipedrive_get_deal",
            "pipedrive_update_deal",
            "pipedrive_add_contact",
            "pipedrive_list_contacts",
            "pipedrive_get_contact",
            "pipedrive_update_contact",
            "pipedrive_search",
            "pipedrive_get_activities",
            "pipedrive_get_activity",
            "pipedrive_add_activity",
            "pipedrive_update_activity",
            "pipedrive_search_deals",
            "pipedrive_search_persons",
            "pipedrive_get_organizations",
            "pipedrive_get_organization",
            "pipedrive_add_organization",
            "pipedrive_update_organization",
            "pipedrive_search_organization",
            "pipedrive_search_leads",
            "pipedrive_convert_lead_to_deal",
            "pipedrive_get_lead_conversion_status",
            "pipedrive_get_stages",
            "pipedrive_get_stage",
            "pipedrive_get_notes",
            "pipedrive_get_note",
            "pipedrive_add_note",
            "pipedrive_update_note",
        ),
    ),
    "salesforce": ProviderMcpPolicy(
        "https://api.salesforce.com/platform/mcp/v1/platform/sobject-all",
        ("salesforce_",),
        required_scope="mcp_api",
        mapped_tools=(
            "salesforce_query",
            "salesforce_create_contact",
            "salesforce_create_opportunity",
            "salesforce_update_opportunity",
        ),
    ),
    "slack": ProviderMcpPolicy("https://mcp.slack.com/mcp", ("slack_",)),
}


@dataclass(frozen=True, slots=True)
class McpAttempt:
    status: Literal["fallback", "completed"]
    data: Any = None
    failed: bool = False


def _oauth_material(
    credential: CredentialLease | Mapping[str, Any],
) -> tuple[str, tuple[str, ...]] | None:
    if isinstance(credential, OAuthCredentialLease):
        return credential.access_token, credential.scopes
    if not isinstance(credential, Mapping) or credential.get("type") != "oauth2":
        return None
    token = credential.get("accessToken")
    scopes = credential.get("scopes", ())
    if not isinstance(token, str) or not isinstance(scopes, (list, tuple)):
        return None
    if not all(isinstance(scope, str) for scope in scopes):
        return None
    return token, tuple(scopes)


def _normalized_tool_name(value: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", value.lower()))


def _camel_key(value: str) -> str:
    return re.sub(r"_([a-z])", lambda match: match.group(1).upper(), value)


def _camel(value: Any) -> Any:
    if isinstance(value, list):
        return [_camel(entry) for entry in value]
    if isinstance(value, Mapping):
        return {_camel_key(str(key)): _camel(entry) for key, entry in value.items()}
    return value


def _hubspot_call(
    tool_name: str, arguments: Mapping[str, Any]
) -> tuple[str, dict[str, Any]] | None:
    if tool_name in {"hubspot_list_contacts", "hubspot_list_deals"}:
        return (
            "search_crm_objects",
            {
                **arguments,
                "objectType": "contacts" if tool_name.endswith("contacts") else "deals",
            },
        )
    if tool_name in {"hubspot_get_contact", "hubspot_get_deal"}:
        is_contact = tool_name.endswith("contact")
        object_id = arguments.get("contactId" if is_contact else "dealId")
        if not isinstance(object_id, str) or not object_id:
            return None
        return (
            "get_crm_objects",
            {
                "objectType": "contacts" if is_contact else "deals",
                "objectIds": [object_id],
                **(
                    {"properties": arguments["properties"]}
                    if isinstance(arguments.get("properties"), list)
                    else {}
                ),
            },
        )
    return None


def _airtable_call(
    tool_name: str, arguments: Mapping[str, Any]
) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "airtable_list_bases" and "offset" not in arguments:
        return "list_bases", {}
    if tool_name == "airtable_get_base_schema" and isinstance(arguments.get("base_id"), str):
        return "list_tables_for_base", {"baseId": arguments["base_id"]}
    return None


def _pipedrive_call(
    tool_name: str, arguments: Mapping[str, Any]
) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "pipedrive_get_deal":
        return "getDeal", {"id": arguments.get("deal_id")}
    if tool_name == "pipedrive_get_contact":
        return "getPerson", {"id": arguments.get("person_id")}
    if tool_name in {"pipedrive_list_deals", "pipedrive_list_contacts"}:
        if any(key != "start" for key in arguments) or arguments.get("start", 0) != 0:
            return None
        return ("getDeals" if tool_name.endswith("deals") else "getPersons"), {}
    if tool_name in {"pipedrive_create_deal", "pipedrive_add_contact"}:
        return (
            "addDeal" if tool_name.endswith("deal") else "addPerson",
            _camel(arguments),
        )
    if tool_name == "pipedrive_update_deal":
        changes = {key: value for key, value in arguments.items() if key != "deal_id"}
        return "updateDeal", {"id": arguments.get("deal_id"), **_camel(changes)}
    if tool_name == "pipedrive_update_contact":
        changes = {key: value for key, value in arguments.items() if key != "person_id"}
        return "updatePerson", {"id": arguments.get("person_id"), **_camel(changes)}
    provider_name = {
        "pipedrive_get_activities": "getActivities",
        "pipedrive_get_activity": "getActivity",
        "pipedrive_add_activity": "addActivity",
        "pipedrive_update_activity": "updateActivity",
        "pipedrive_search_deals": "searchDeals",
        "pipedrive_search_persons": "searchPersons",
        "pipedrive_get_organizations": "getOrganizations",
        "pipedrive_get_organization": "getOrganization",
        "pipedrive_add_organization": "addOrganization",
        "pipedrive_update_organization": "updateOrganization",
        "pipedrive_search_organization": "searchOrganization",
        "pipedrive_search_leads": "searchLeads",
        "pipedrive_convert_lead_to_deal": "convertLeadToDeal",
        "pipedrive_get_lead_conversion_status": "getLeadConversionStatus",
        "pipedrive_get_stages": "getStages",
        "pipedrive_get_stage": "getStage",
        "pipedrive_get_notes": "getNotes",
        "pipedrive_get_note": "getNote",
        "pipedrive_add_note": "addNote",
        "pipedrive_update_note": "updateNote",
    }.get(tool_name)
    if provider_name:
        return provider_name, _camel(arguments)
    return None


def _gmail_call(tool_name: str, arguments: Mapping[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "gmail_create_draft":
        result = {key: value for key, value in arguments.items() if key not in {"html", "body"}}
        if arguments.get("html") is True:
            result["htmlBody"] = arguments.get("body")
        elif arguments.get("body"):
            result["body"] = arguments["body"]
        return "create_draft", result
    if tool_name == "gmail_create_label":
        if arguments.get("label_list_visibility") not in {None, "labelShow"} or arguments.get(
            "message_list_visibility"
        ) not in {None, "show"}:
            return None
        color = {}
        if isinstance(arguments.get("background_color"), str) and isinstance(
            arguments.get("text_color"), str
        ):
            color = {
                "color": {
                    "backgroundColor": arguments["background_color"],
                    "textColor": arguments["text_color"],
                }
            }
        return "create_label", {"displayName": arguments.get("name"), **color}
    if tool_name == "gmail_get_thread":
        if arguments.get("format") == "metadata" or "metadata_headers" in arguments:
            return None
        return "get_thread", {
            "threadId": arguments.get("id"),
            "messageFormat": "MINIMAL" if arguments.get("format") == "minimal" else "FULL_CONTENT",
        }
    if tool_name == "gmail_list_drafts":
        if isinstance(arguments.get("max_results"), (int, float)) and arguments["max_results"] > 50:
            return None
        return "list_drafts", {
            **({"pageSize": arguments["max_results"]} if "max_results" in arguments else {}),
            **({"pageToken": arguments["page_token"]} if "page_token" in arguments else {}),
        }
    if tool_name == "gmail_list_labels":
        return "list_labels", {}
    if tool_name == "gmail_modify_email":
        added = arguments.get("add_label_ids", [])
        removed = arguments.get("remove_label_ids", [])
        if isinstance(added, list) and added and (not isinstance(removed, list) or not removed):
            return "label_message", {"messageId": arguments.get("id"), "labelIds": added}
        if isinstance(removed, list) and removed and (not isinstance(added, list) or not added):
            return "unlabel_message", {"messageId": arguments.get("id"), "labelIds": removed}
    return None


def _calendar_call(
    tool_name: str, arguments: Mapping[str, Any]
) -> tuple[str, dict[str, Any]] | None:
    names = {
        "gcal_create_event": "create_event",
        "gcal_list_events": "list_events",
        "gcal_update_event": "update_event",
        "gcal_get_event": "get_event",
        "gcal_delete_event": "delete_event",
        "gcal_list_calendars": "list_calendars",
    }
    provider_name = names.get(tool_name)
    if provider_name is None:
        return None

    if tool_name == "gcal_list_events":
        if (
            arguments.get("single_events") is True
            or arguments.get("show_deleted") is True
            or "updated_min" in arguments
            or (
                isinstance(arguments.get("max_results"), (int, float))
                and arguments["max_results"] > 250
            )
        ):
            return None
        order_by = arguments.get("order_by")
        return provider_name, {
            **({"calendarId": arguments["calendar_id"]} if "calendar_id" in arguments else {}),
            **({"pageSize": arguments["max_results"]} if "max_results" in arguments else {}),
            **({"pageToken": arguments["page_token"]} if "page_token" in arguments else {}),
            **({"startTime": arguments["time_min"]} if "time_min" in arguments else {}),
            **({"endTime": arguments["time_max"]} if "time_max" in arguments else {}),
            **({"timeZone": arguments["timezone"]} if "timezone" in arguments else {}),
            **(
                {"orderBy": "lastModified" if order_by == "updated" else order_by}
                if order_by is not None
                else {}
            ),
            **({"fullText": arguments["q"]} if "q" in arguments else {}),
        }

    if tool_name == "gcal_list_calendars":
        if (
            "min_access_role" in arguments
            or arguments.get("show_deleted") is True
            or arguments.get("show_hidden") is True
            or (
                isinstance(arguments.get("max_results"), (int, float))
                and arguments["max_results"] > 250
            )
        ):
            return None
        return provider_name, {
            **({"pageSize": arguments["max_results"]} if "max_results" in arguments else {}),
            **({"pageToken": arguments["page_token"]} if "page_token" in arguments else {}),
        }

    if tool_name == "gcal_get_event":
        if "timezone" in arguments:
            return None
        return provider_name, {
            "eventId": arguments.get("event_id"),
            **({"calendarId": arguments["calendar_id"]} if "calendar_id" in arguments else {}),
        }

    notification_level = {"all": "ALL", "externalOnly": "EXTERNAL_ONLY", "none": "NONE"}.get(
        str(arguments.get("send_updates"))
    )
    if tool_name == "gcal_delete_event":
        return provider_name, {
            "eventId": arguments.get("event_id"),
            **({"calendarId": arguments["calendar_id"]} if "calendar_id" in arguments else {}),
            **({"notificationLevel": notification_level} if notification_level else {}),
        }

    if arguments.get("visibility") == "confidential" or (
        tool_name == "gcal_update_event"
        and any(key in arguments for key in ("attendees", "recurrence", "status"))
    ):
        return None

    result = {
        **({"calendarId": arguments["calendar_id"]} if "calendar_id" in arguments else {}),
        **({"summary": arguments["summary"]} if "summary" in arguments else {}),
        **({"description": arguments["description"]} if "description" in arguments else {}),
        **({"location": arguments["location"]} if "location" in arguments else {}),
        **({"startTime": arguments["start_time"]} if "start_time" in arguments else {}),
        **({"endTime": arguments["end_time"]} if "end_time" in arguments else {}),
        **({"timeZone": arguments["timezone"]} if "timezone" in arguments else {}),
        **({"colorId": arguments["color_id"]} if "color_id" in arguments else {}),
        **({"visibility": arguments["visibility"]} if "visibility" in arguments else {}),
        **({"notificationLevel": notification_level} if notification_level else {}),
    }
    if any(
        isinstance(arguments.get(key), str) and "T" not in arguments[key]
        for key in ("start_time", "end_time")
    ):
        result["allDay"] = True
    if tool_name == "gcal_update_event":
        result["eventId"] = arguments.get("event_id")
    if tool_name == "gcal_create_event" and isinstance(arguments.get("attendees"), list):
        result["attendees"] = [
            {
                **{key: value for key, value in attendee.items() if key != "optional"},
                **({"optionalAttendee": attendee["optional"]} if "optional" in attendee else {}),
            }
            if isinstance(attendee, Mapping)
            else attendee
            for attendee in arguments["attendees"]
        ]
    if tool_name == "gcal_create_event" and "recurrence" in arguments:
        result["recurrenceData"] = arguments["recurrence"]
    reminders = arguments.get("reminders")
    if isinstance(reminders, Mapping) and isinstance(reminders.get("overrides"), list):
        result["overrideReminders"] = _camel(reminders["overrides"])
    return provider_name, result


def _drive_call(tool_name: str, arguments: Mapping[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "gdrive_get_file":
        if "fields" in arguments or arguments.get("supports_all_drives") is True:
            return None
        return "get_file_metadata", {"fileId": arguments.get("file_id")}
    if tool_name == "gdrive_upload_file":
        if (
            "description" in arguments
            or arguments.get("starred") is True
            or arguments.get("supports_all_drives") is True
        ):
            return None
        return "create_file", {
            "title": arguments.get("name"),
            "contentMimeType": arguments.get("mime_type"),
            "base64Content": arguments.get("content"),
            **(
                {"parentId": arguments["parent_folder_id"]}
                if arguments.get("parent_folder_id")
                else {}
            ),
        }
    if tool_name == "gdrive_create_folder":
        if (
            arguments.get("description")
            or arguments.get("starred") is True
            or arguments.get("supports_all_drives") is True
        ):
            return None
        return "create_file", {
            "title": arguments.get("name"),
            "contentMimeType": "application/vnd.google-apps.folder",
            **(
                {"parentId": arguments["parent_folder_id"]}
                if arguments.get("parent_folder_id")
                else {}
            ),
        }
    if (
        tool_name == "gdrive_download_file"
        and not arguments.get("mime_type")
        and arguments.get("supports_all_drives") is not True
    ):
        return "download_file_content", {"fileId": arguments.get("file_id")}
    if tool_name == "gdrive_copy_file":
        if arguments.get("supports_all_drives") is True:
            return None
        return "copy_file", {
            "fileId": arguments.get("file_id"),
            **({"title": arguments["name"]} if arguments.get("name") else {}),
            **(
                {"parentId": arguments["parent_folder_id"]}
                if arguments.get("parent_folder_id")
                else {}
            ),
        }
    if tool_name == "gdrive_search_files":
        if "order_by" in arguments or arguments.get("supports_all_drives") is True:
            return None
        return "search_files", {
            "query": arguments.get("query"),
            **({"pageSize": arguments["max_results"]} if "max_results" in arguments else {}),
            **({"pageToken": arguments["page_token"]} if arguments.get("page_token") else {}),
        }
    if tool_name == "gdrive_list_permissions":
        if arguments.get("supports_all_drives") is True:
            return None
        return "get_file_permissions", {"fileId": arguments.get("file_id")}
    return None


def _salesforce_call(
    tool_name: str, arguments: Mapping[str, Any]
) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "salesforce_query" and arguments.get("includeDeleted") is not True:
        return "soqlQuery", {"query": arguments.get("query")}
    if tool_name in {"salesforce_create_contact", "salesforce_create_opportunity"}:
        body = {key: value for key, value in arguments.items() if key != "customFields"}
        custom = arguments.get("customFields")
        if isinstance(custom, Mapping):
            body.update(custom)
        return "createSobjectRecord", {
            "sobject-name": "Contact" if tool_name.endswith("contact") else "Opportunity",
            "body": body,
        }
    if tool_name == "salesforce_update_opportunity":
        body = {
            key: value
            for key, value in arguments.items()
            if key not in {"opportunityId", "customFields"}
        }
        custom = arguments.get("customFields")
        if isinstance(custom, Mapping):
            body.update(custom)
        return "updateSobjectRecord", {
            "sobject-name": "Opportunity",
            "id": arguments.get("opportunityId"),
            "body": body,
        }
    return None


def _jira_call(tool_name: str, arguments: Mapping[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "jira_create_issue":
        omitted = {
            "issueType",
            "assigneeAccountId",
            "labels",
            "components",
            "dueDate",
            "priority",
        }
        result = {key: value for key, value in arguments.items() if key not in omitted}
        result["issueTypeName"] = arguments.get("issueType")
        if arguments.get("assigneeAccountId"):
            result["assignee_account_id"] = arguments["assigneeAccountId"]
        additional: dict[str, Any] = {}
        if arguments.get("labels"):
            additional["labels"] = arguments["labels"]
        if arguments.get("components"):
            additional["components"] = arguments["components"]
        if arguments.get("dueDate"):
            additional["duedate"] = arguments["dueDate"]
        if arguments.get("priority"):
            additional["priority"] = {"name": arguments["priority"]}
        if additional:
            result["additional_fields"] = additional
        return "createJiraIssue", result
    if tool_name == "jira_list_issues":
        if isinstance(arguments.get("startAt"), (int, float)) and arguments["startAt"] > 0:
            return None
        conditions = []
        if arguments.get("projectKey"):
            conditions.append(f"project = {arguments['projectKey']}")
        if arguments.get("assigneeAccountId"):
            conditions.append(f"assignee = {arguments['assigneeAccountId']}")
        if arguments.get("status"):
            status = arguments["status"]
            conditions.append(f'status = "{status}"')
        jql = (
            arguments.get("jql")
            if isinstance(arguments.get("jql"), str)
            else " AND ".join(conditions)
        )
        return "searchJiraIssuesUsingJql", {
            "jql": jql,
            **({"maxResults": arguments["maxResults"]} if "maxResults" in arguments else {}),
            **({"fields": arguments["fields"]} if "fields" in arguments else {}),
        }
    return None


def _github_call(tool_name: str, arguments: Mapping[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if tool_name == "github_create_issue":
        return "issue_write", {**arguments, "method": "create"}
    if tool_name == "github_list_issues":
        result = {key: value for key, value in arguments.items() if key != "limit"}
        if "limit" in arguments:
            result["perPage"] = arguments["limit"]
        return "list_issues", result
    if tool_name == "github_get_file":
        return "get_file_contents", dict(arguments)
    if tool_name == "github_create_file":
        if not isinstance(arguments.get("branch"), str) or not arguments["branch"]:
            return None
        return "create_or_update_file", dict(arguments)
    if tool_name in {"github_search_code", "github_list_pull_requests"}:
        result = {key: value for key, value in arguments.items() if key != "limit"}
        if "limit" in arguments:
            result["perPage"] = arguments["limit"]
        return (
            "search_code" if tool_name == "github_search_code" else "list_pull_requests",
            result,
        )
    return None


def _resolve_call(
    policy: ProviderMcpPolicy,
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    provider_tool_names: list[str],
) -> tuple[str, dict[str, Any], bool] | None:
    if service_id == "hubspot":
        mapped = _hubspot_call(tool_name, arguments)
        if mapped and mapped[0] in provider_tool_names:
            return mapped[0], mapped[1], False
        return None

    mapper = {
        "airtable": _airtable_call,
        "github": _github_call,
        "gmail": _gmail_call,
        "google-calendar": _calendar_call,
        "google-drive": _drive_call,
        "jira": _jira_call,
        "pipedrive": _pipedrive_call,
        "salesforce": _salesforce_call,
    }.get(service_id)
    mapped = mapper(tool_name, arguments) if mapper else None
    if mapped and mapped[0] in provider_tool_names:
        return mapped[0], mapped[1], service_id == "jira"
    if mapper and mapped is None and tool_name in policy.mapped_tools:
        return None

    candidates = {tool_name}
    for prefix in policy.prefixes:
        if tool_name.startswith(prefix):
            candidates.add(tool_name[len(prefix) :])
    normalized = {_normalized_tool_name(candidate) for candidate in candidates}
    matches = [name for name in provider_tool_names if _normalized_tool_name(name) in normalized]
    return (matches[0], dict(arguments), False) if len(matches) == 1 else None


def _atlassian_cloud_id(value: Any) -> str | None:
    if isinstance(value, str):
        try:
            return _atlassian_cloud_id(json.loads(value))
        except (TypeError, ValueError):
            return None
    if isinstance(value, list):
        for entry in value:
            cloud_id = _atlassian_cloud_id(entry)
            if cloud_id:
                return cloud_id
        return None
    if not isinstance(value, Mapping):
        return None
    if isinstance(value.get("cloudId"), str) and value["cloudId"]:
        return str(value["cloudId"])
    if (
        isinstance(value.get("id"), str)
        and value["id"]
        and isinstance(value.get("url"), str)
        and httpx.URL(str(value["url"])).host.endswith(".atlassian.net")
    ):
        return str(value["id"])
    for entry in value.values():
        cloud_id = _atlassian_cloud_id(entry)
        if cloud_id:
            return cloud_id
    return None


def _rpc_payload(response: httpx.Response) -> Mapping[str, Any]:
    response.raise_for_status()
    if not response.content:
        return {}
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        events = []
        for line in response.text.splitlines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
        if not events:
            raise ValueError("empty MCP event stream")
        payload = events[-1]
    else:
        payload = response.json()
    if not isinstance(payload, Mapping) or payload.get("error") is not None:
        raise ValueError("invalid MCP response")
    return payload


def _headers(access_token: str, session_id: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    return headers


def execute_preferred_provider_mcp(
    *,
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    credential: CredentialLease | Mapping[str, Any],
    transport: httpx.BaseTransport | None = None,
    timeout: float = 30.0,
) -> McpAttempt:
    policy = POLICIES.get(service_id)
    material = _oauth_material(credential)
    if policy is None or material is None:
        return McpAttempt("fallback")
    access_token, scopes = material
    if policy.required_scope and policy.required_scope not in scopes:
        return McpAttempt("fallback")

    call_started = False
    try:
        with httpx.Client(transport=transport, timeout=timeout) as client:
            initialize = client.post(
                policy.endpoint,
                headers=_headers(access_token),
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": MCP_PROTOCOL_VERSION,
                        "capabilities": {},
                        "clientInfo": {"name": "authlane-python", "version": "0.1.0"},
                    },
                },
            )
            _rpc_payload(initialize)
            session_id = initialize.headers.get("mcp-session-id")
            client.post(
                policy.endpoint,
                headers=_headers(access_token, session_id),
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            ).raise_for_status()
            listed = _rpc_payload(
                client.post(
                    policy.endpoint,
                    headers=_headers(access_token, session_id),
                    json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
                )
            )
            result = listed.get("result")
            tools = result.get("tools") if isinstance(result, Mapping) else None
            names = [
                tool["name"]
                for tool in tools or []
                if isinstance(tool, Mapping) and isinstance(tool.get("name"), str)
            ]
            call = _resolve_call(policy, service_id, tool_name, arguments, names)
            if call is None:
                return (
                    McpAttempt("fallback")
                    if policy.allow_direct_fallback
                    else McpAttempt("completed", failed=True)
                )

            provider_arguments = call[1]
            if call[2]:
                if "getAccessibleAtlassianResources" not in names:
                    return McpAttempt("fallback")
                resources = _rpc_payload(
                    client.post(
                        policy.endpoint,
                        headers=_headers(access_token, session_id),
                        json={
                            "jsonrpc": "2.0",
                            "id": 3,
                            "method": "tools/call",
                            "params": {
                                "name": "getAccessibleAtlassianResources",
                                "arguments": {},
                            },
                        },
                    )
                )
                cloud_id = _atlassian_cloud_id(resources.get("result"))
                if not cloud_id:
                    return McpAttempt("fallback")
                provider_arguments = {"cloudId": cloud_id, **provider_arguments}

            call_started = True
            called = _rpc_payload(
                client.post(
                    policy.endpoint,
                    headers=_headers(access_token, session_id),
                    json={
                        "jsonrpc": "2.0",
                        "id": 4,
                        "method": "tools/call",
                        "params": {"name": call[0], "arguments": provider_arguments},
                    },
                )
            )
            data = called.get("result")
            failed = isinstance(data, Mapping) and data.get("isError") is True
            return McpAttempt("completed", data=data, failed=failed)
    except Exception:
        if not call_started and policy.allow_direct_fallback:
            return McpAttempt("fallback")
        return McpAttempt("completed", failed=True)


async def aexecute_preferred_provider_mcp(
    *,
    service_id: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    credential: CredentialLease | Mapping[str, Any],
    transport: httpx.AsyncBaseTransport | None = None,
    timeout: float = 30.0,
) -> McpAttempt:
    policy = POLICIES.get(service_id)
    material = _oauth_material(credential)
    if policy is None or material is None:
        return McpAttempt("fallback")
    access_token, scopes = material
    if policy.required_scope and policy.required_scope not in scopes:
        return McpAttempt("fallback")

    call_started = False
    try:
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            initialize = await client.post(
                policy.endpoint,
                headers=_headers(access_token),
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": MCP_PROTOCOL_VERSION,
                        "capabilities": {},
                        "clientInfo": {"name": "authlane-python", "version": "0.1.0"},
                    },
                },
            )
            _rpc_payload(initialize)
            session_id = initialize.headers.get("mcp-session-id")
            initialized = await client.post(
                policy.endpoint,
                headers=_headers(access_token, session_id),
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            )
            initialized.raise_for_status()
            list_response = await client.post(
                policy.endpoint,
                headers=_headers(access_token, session_id),
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            )
            listed = _rpc_payload(list_response)
            result = listed.get("result")
            tools = result.get("tools") if isinstance(result, Mapping) else None
            names = [
                tool["name"]
                for tool in tools or []
                if isinstance(tool, Mapping) and isinstance(tool.get("name"), str)
            ]
            call = _resolve_call(policy, service_id, tool_name, arguments, names)
            if call is None:
                return (
                    McpAttempt("fallback")
                    if policy.allow_direct_fallback
                    else McpAttempt("completed", failed=True)
                )

            provider_arguments = call[1]
            if call[2]:
                if "getAccessibleAtlassianResources" not in names:
                    return McpAttempt("fallback")
                resources_response = await client.post(
                    policy.endpoint,
                    headers=_headers(access_token, session_id),
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/call",
                        "params": {
                            "name": "getAccessibleAtlassianResources",
                            "arguments": {},
                        },
                    },
                )
                resources = _rpc_payload(resources_response)
                cloud_id = _atlassian_cloud_id(resources.get("result"))
                if not cloud_id:
                    return McpAttempt("fallback")
                provider_arguments = {"cloudId": cloud_id, **provider_arguments}

            call_started = True
            call_response = await client.post(
                policy.endpoint,
                headers=_headers(access_token, session_id),
                json={
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {"name": call[0], "arguments": provider_arguments},
                },
            )
            called = _rpc_payload(call_response)
            data = called.get("result")
            failed = isinstance(data, Mapping) and data.get("isError") is True
            return McpAttempt("completed", data=data, failed=failed)
    except Exception:
        if not call_started and policy.allow_direct_fallback:
            return McpAttempt("fallback")
        return McpAttempt("completed", failed=True)
