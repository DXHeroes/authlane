-- Where a server's OAuth client came from.
--
-- Until now the only writer of `oauth_client_id` was RFC 7591 dynamic registration, so provenance
-- was implicit. A tenant can now paste a client from an application they created themselves, which
-- is the only way to reach a server that offers no registration endpoint at all. The two must be
-- told apart: offering "remove credentials" for a registered client would abandon it at the
-- provider on the next rediscovery, and the guard that stops registration overwriting a stored
-- client is currently load-bearing by accident rather than by name.
ALTER TABLE "mcp_servers" ADD COLUMN "oauth_client_source" text;
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_oauth_client_source_check"
  CHECK ("oauth_client_source" IN ('dynamic', 'manual'));

-- Every client id that exists today was registered by Authlane; nothing else could write one.
UPDATE "mcp_servers" SET "oauth_client_source" = 'dynamic' WHERE "oauth_client_id" IS NOT NULL;
