from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from authlane.executors import execute

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "typescript-provider-parity.json"
PARITY_DOCUMENT = json.loads(FIXTURE_PATH.read_text())
PARITY_CASES = PARITY_DOCUMENT["cases"]


def test_typescript_fixture_covers_all_tools_defaults_and_optional_branches() -> None:
    canonical = json.loads(
        (
            Path(__file__).parents[2]
            / "integration-contracts"
            / "generated"
            / "v1"
            / "integrations.json"
        ).read_text()
    )
    canonical_tools = {
        (integration["serviceId"], tool["name"])
        for integration in canonical["integrations"]
        for tool in integration["tools"]
    }
    fixture_tools = {(case["serviceId"], case["toolName"]) for case in PARITY_CASES}

    assert PARITY_DOCUMENT["schemaVersion"] == 2
    assert PARITY_DOCUMENT["generator"]["source"] == ("integrations/*/tools.ts exported handlers")
    assert len(canonical_tools) == 108
    assert fixture_tools == canonical_tools
    assert len(PARITY_CASES) >= 1000
    assert all(
        any(
            case["serviceId"] == service_id
            and case["toolName"] == tool_name
            and case["variant"] == "defaults"
            for case in PARITY_CASES
        )
        for service_id, tool_name in canonical_tools
    )
    variants = {(case["serviceId"], case["toolName"], case["variant"]) for case in PARITY_CASES}
    assert sum(case["variant"] == "unknown-field" for case in PARITY_CASES) == 108
    expected_falsey: set[tuple[str, str, str]] = set()
    for integration in canonical["integrations"]:
        for tool in integration["tools"]:
            schema = tool["inputSchema"]
            required = set(schema.get("required", []))
            for name, property_schema in schema.get("properties", {}).items():
                if name in required or not _supports_falsey_variant(property_schema):
                    continue
                expected_falsey.add((integration["serviceId"], tool["name"], f"falsey-{name}"))
    assert expected_falsey
    assert expected_falsey <= variants


@pytest.mark.parametrize("case", PARITY_CASES, ids=lambda case: case["id"])
def test_python_executor_matches_typescript_provider_fixture(case: dict[str, Any]) -> None:
    actual_requests: list[httpx.Request] = []
    responses = list(case["responses"])

    def provider(request: httpx.Request) -> httpx.Response:
        actual_requests.append(request)
        if not responses:
            raise AssertionError(f"unexpected provider request: {request.method} {request.url}")
        response = responses.pop(0)
        return httpx.Response(
            response["status"],
            content=base64.b64decode(response["bodyBase64"]),
            headers=response["headers"],
        )

    credential: dict[str, Any] = {"type": "oauth2", "accessToken": "provider-secret"}
    if case["serviceId"] == "pipedrive":
        credential["providerContext"] = {"apiBaseUrl": "https://acme.pipedrive.com"}
    elif case["serviceId"] == "salesforce":
        credential["providerContext"] = {"apiBaseUrl": "https://acme.my.salesforce.com"}

    result = execute(
        service_id=case["serviceId"],
        tool_name=case["toolName"],
        arguments=case["input"],
        credential=credential,
        transport=httpx.MockTransport(provider),
    )

    if case["expectedError"] is not None:
        assert result.data is None and result.error is not None
        assert result.error.code == "PROVIDER_ERROR"
    else:
        assert result.error is None
        assert result.data == case["result"]
    assert responses == []
    assert len(actual_requests) == len(case["requests"])
    for request, expected in zip(actual_requests, case["requests"], strict=True):
        assert request.method == expected["method"]
        assert f"{request.url.scheme}://{request.url.host}" == expected["origin"]
        assert request.url.path == expected["path"]
        assert list(request.url.params.multi_items()) == [tuple(item) for item in expected["query"]]
        for name, value in expected["headers"].items():
            assert request.headers[name] == value
        _assert_body_equal(request, expected)


def _assert_body_equal(request: httpx.Request, expected: dict[str, Any]) -> None:
    expected_body = expected["body"]
    if expected_body is None:
        assert request.content == b""
        return
    actual_body = request.content.decode()
    content_type = expected["headers"].get("content-type", "")
    if content_type == "application/json":
        assert json.loads(actual_body) == json.loads(expected_body)
    else:
        assert actual_body == expected_body


def _supports_falsey_variant(schema: dict[str, Any]) -> bool:
    if "enum" in schema:
        return False
    if schema.get("type") == "boolean":
        return True
    if schema.get("type") in {"integer", "number"}:
        return schema.get("minimum", 0) <= 0
    if schema.get("type") == "string":
        return schema.get("minLength", 0) == 0
    if schema.get("type") == "array":
        return schema.get("minItems", 0) == 0
    if schema.get("type") == "object":
        return not schema.get("required")
    return False
