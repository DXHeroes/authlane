from __future__ import annotations

from .models import AuthlaneError

DOCS = "https://authlane.io/docs/sdk/python"


def error(code: str, message: str, hint: str) -> AuthlaneError:
    return AuthlaneError(message=message, code=code, hint=hint, doc_url=DOCS)


def validation_error(message: str = "Invalid request parameters.") -> AuthlaneError:
    return error("VALIDATION_ERROR", message, "Check the documented parameter constraints.")


def network_error() -> AuthlaneError:
    return error(
        "NETWORK_ERROR", "The Authlane request failed.", "Check connectivity and base_url."
    )


def timeout_error() -> AuthlaneError:
    return error("TIMEOUT_ERROR", "The Authlane request timed out.", "Increase the timeout.")


def invalid_response() -> AuthlaneError:
    return error(
        "INVALID_RESPONSE", "Authlane returned an invalid response.", "Check SDK/API versions."
    )


def adapter_error() -> AuthlaneError:
    return error("ADAPTER_ERROR", "The tool adapter failed.", "Check adapter configuration.")


def invalid_tool_input() -> AuthlaneError:
    return error("INVALID_TOOL_INPUT", "Tool input is invalid.", "Use the tool JSON schema.")


def provider_error() -> AuthlaneError:
    return error("PROVIDER_ERROR", "The provider request failed.", "Check the connected account.")


def credential_lease_error() -> AuthlaneError:
    return error(
        "CREDENTIAL_LEASE_ERROR",
        "A credential lease could not be issued.",
        "Reconnect the service or check API-key scopes.",
    )
