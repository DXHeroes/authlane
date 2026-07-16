CREATE TABLE "oauth_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"connect_session_id" text NOT NULL,
	"service_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"pkce_secret_id" text NOT NULL,
	"callback_url" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connect_sessions" ADD COLUMN "destructive_action_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "refresh_lock_token" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "refresh_lock_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_transactions" ADD CONSTRAINT "oauth_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_transactions" ADD CONSTRAINT "oauth_transactions_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_transactions" ADD CONSTRAINT "oauth_transactions_connect_session_id_connect_sessions_id_fk" FOREIGN KEY ("connect_session_id") REFERENCES "public"."connect_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_transactions" ADD CONSTRAINT "oauth_transactions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_transactions" ADD CONSTRAINT "oauth_transactions_pkce_secret_id_secret_records_id_fk" FOREIGN KEY ("pkce_secret_id") REFERENCES "public"."secret_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_transactions_state_hash_unique" ON "oauth_transactions" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "oauth_transactions_connection_created_idx" ON "oauth_transactions" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_transactions_expires_at_idx" ON "oauth_transactions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "oauth_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth_transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "oauth_transactions_tenant_isolation" ON "oauth_transactions"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
CREATE POLICY "api_keys_authentication_lookup" ON "api_keys" FOR SELECT
  USING ("id" = current_setting('authlane.api_key_id', true));--> statement-breakpoint
CREATE POLICY "connect_sessions_authentication_lookup" ON "connect_sessions" FOR SELECT
  USING ("token_hash" = current_setting('authlane.connect_token_hash', true));--> statement-breakpoint
CREATE POLICY "oauth_transactions_state_lookup" ON "oauth_transactions" FOR SELECT
  USING ("state_hash" = current_setting('authlane.oauth_state_hash', true));--> statement-breakpoint
CREATE POLICY "oauth_transactions_state_consume" ON "oauth_transactions" FOR UPDATE
  USING ("state_hash" = current_setting('authlane.oauth_state_hash', true))
  WITH CHECK ("state_hash" = current_setting('authlane.oauth_state_hash', true));--> statement-breakpoint
DROP POLICY "credential_access_logs_tenant_isolation" ON "credential_access_logs";--> statement-breakpoint
CREATE POLICY "credential_access_logs_tenant_read" ON "credential_access_logs" FOR SELECT
  USING ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
CREATE POLICY "credential_access_logs_tenant_insert" ON "credential_access_logs" FOR INSERT
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
CREATE OR REPLACE FUNCTION authlane_prevent_credential_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'credential access audit rows are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER credential_access_logs_append_only
  BEFORE UPDATE OR DELETE ON "credential_access_logs"
  FOR EACH ROW EXECUTE FUNCTION authlane_prevent_credential_audit_mutation();
