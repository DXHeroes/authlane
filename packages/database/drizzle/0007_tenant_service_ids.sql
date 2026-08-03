-- Service ids now come from two places: the global `services` catalog and a tenant's own
-- `mcp_servers`. Three tables record activity against either kind, so their foreign key to
-- `services` would reject every tenant server connection.
--
-- `organization_services` keeps its constraint: it configures built-in catalog entries only, and a
-- tenant server carries its configuration on its own row.
--
-- What replaces the constraint: `isConnectableServiceId` rejects an unknown id before any write,
-- and RLS confines every row to the organization that owns it. What is lost is the cascade from a
-- deleted catalog entry, so removing a built-in service now leaves its connections behind rather
-- than deleting them silently.
ALTER TABLE "connections" DROP CONSTRAINT "connections_service_id_services_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_transactions" DROP CONSTRAINT "oauth_transactions_service_id_services_id_fk";--> statement-breakpoint
ALTER TABLE "credential_access_logs" DROP CONSTRAINT "credential_access_logs_service_id_services_id_fk";--> statement-breakpoint

-- Deleting a tenant server must not leave its connections and their credentials behind.
CREATE OR REPLACE FUNCTION authlane_delete_mcp_server_connections() RETURNS trigger AS $$
BEGIN
  DELETE FROM "connections" WHERE "service_id" = OLD."id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "mcp_servers_delete_connections"
  BEFORE DELETE ON "mcp_servers"
  FOR EACH ROW EXECUTE FUNCTION authlane_delete_mcp_server_connections();
