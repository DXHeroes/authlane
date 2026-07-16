#!/usr/bin/env bash

set -euo pipefail

: "${API_URL:=http://localhost:3000}"
: "${API_KEY:?Set API_KEY to a server-side key scoped to credentials:issue}"
: "${EXTERNAL_USER_ID:?Set EXTERNAL_USER_ID}"
: "${SERVICE_ID:?Set SERVICE_ID}"

response_file="$(mktemp)"
cleanup() {
  rm -f "$response_file"
}
trap cleanup EXIT

status="$({
  curl --silent --show-error \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --request POST \
    --header "Authorization: Bearer $API_KEY" \
    --header 'Accept: application/json' \
    "$API_URL/api/v1/users/$EXTERNAL_USER_ID/connections/$SERVICE_ID/credential-leases"
} || true)"

if [[ "$status" != "201" ]]; then
  error_code="$(jq -r '.error.code // "unknown"' < "$response_file")"
  echo "Credential lease smoke test failed with HTTP $status ($error_code)" >&2
  exit 1
fi

lease_type="$(jq -r '.data.type // empty' < "$response_file")"
lease_id="$(jq -r '.data.leaseId // empty' < "$response_file")"
has_material="$(jq -r '(.data.accessToken // .data.value // "") | length > 0' < "$response_file")"
has_forbidden_tokens="$(jq -r '(.data.refreshToken != null) or (.data.idToken != null)' < "$response_file")"

if [[ -z "$lease_id" || "$has_material" != "true" || "$has_forbidden_tokens" != "false" ]]; then
  echo 'Credential lease response violated the access-only contract' >&2
  exit 1
fi

echo "Credential lease contract passed for type $lease_type; secret material was not printed"
