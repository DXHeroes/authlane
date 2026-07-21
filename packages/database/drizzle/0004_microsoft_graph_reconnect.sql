WITH "legacy_microsoft_credentials" AS MATERIALIZED (
	SELECT
		c."id" AS "connection_id",
		c."organization_id",
		c."credential_secret_id" AS "secret_id"
	FROM "connections" c
	WHERE c."service_id" IN (
		'microsoft-mail',
		'microsoft-calendar',
		'microsoft-sharepoint'
	)
	AND c."credential_secret_id" IS NOT NULL
),
"invalidated_connections" AS (
	UPDATE "connections" c
	SET
		"status" = 'expired',
		"credential_secret_id" = NULL,
		"expires_at" = CURRENT_TIMESTAMP,
		"last_checked_at" = CURRENT_TIMESTAMP,
		"last_error_code" = 'microsoft_graph_reconnect_required',
		"refresh_lock_token" = NULL,
		"refresh_lock_expires_at" = NULL,
		"version" = c."version" + 1,
		"updated_at" = CURRENT_TIMESTAMP
	FROM "legacy_microsoft_credentials" legacy
	WHERE c."id" = legacy."connection_id"
	RETURNING c."id"
)
DELETE FROM "secret_records" sr
USING "legacy_microsoft_credentials" legacy
WHERE sr."id" = legacy."secret_id"
	AND sr."organization_id" = legacy."organization_id"
	AND sr."purpose" = 'connection_credentials'
	AND EXISTS (SELECT 1 FROM "invalidated_connections");
