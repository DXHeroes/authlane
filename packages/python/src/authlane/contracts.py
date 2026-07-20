from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any, cast

from .models import ToolAnnotations, ToolDefinition


@lru_cache(maxsize=1)
def canonical_document() -> dict[str, Any]:
    resource = files("authlane._generated").joinpath("integrations.json")
    return cast(dict[str, Any], json.loads(resource.read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def definitions_by_service() -> dict[str, tuple[ToolDefinition, ...]]:
    return {
        integration["serviceId"]: tuple(
            ToolDefinition(
                service_id=integration["serviceId"],
                name=tool["name"],
                description=tool["description"],
                input_schema=tool["inputSchema"],
                annotations=ToolAnnotations(
                    read_only_hint=tool["annotations"]["readOnlyHint"],
                    destructive_hint=tool["annotations"]["destructiveHint"],
                    idempotent_hint=tool["annotations"]["idempotentHint"],
                    open_world_hint=tool["annotations"]["openWorldHint"],
                ),
            )
            for tool in integration["tools"]
        )
        for integration in canonical_document()["integrations"]
    }


@lru_cache(maxsize=1)
def definition_index() -> dict[tuple[str, str], ToolDefinition]:
    return {
        (service_id, tool.name): tool
        for service_id, tools in definitions_by_service().items()
        for tool in tools
    }
