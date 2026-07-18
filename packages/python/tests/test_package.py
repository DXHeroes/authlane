from __future__ import annotations

from authlane import AsyncAuthlane, Authlane


def test_public_clients_are_importable() -> None:
    assert Authlane.__name__ == "Authlane"
    assert AsyncAuthlane.__name__ == "AsyncAuthlane"


def test_sync_client_context_manager_closes_owned_client() -> None:
    with Authlane(api_key="ak_test", base_url="https://authlane.test") as client:
        assert not client.is_closed

    assert client.is_closed
