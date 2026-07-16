CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_hint" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "credential_access_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"api_key_id" text,
	"ip_address" text,
	"user_agent" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connect_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"allowed_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_origin" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "connect_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"credential_secret_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error_code" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_services" (
	"organization_id" text NOT NULL,
	"service_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"oauth_client_id" text,
	"oauth_client_secret_id" text,
	"custom_scopes" text[],
	"api_key_secret_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "organization_services_organization_id_service_id_pk" PRIMARY KEY("organization_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "secret_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purpose" text NOT NULL,
	"key_id" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"wrapped_dek_iv" text NOT NULL,
	"wrapped_dek_tag" text NOT NULL,
	"ciphertext" text NOT NULL,
	"payload_iv" text NOT NULL,
	"payload_tag" text NOT NULL,
	"aad_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"auth_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_access_logs" ADD CONSTRAINT "credential_access_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_access_logs" ADD CONSTRAINT "credential_access_logs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_access_logs" ADD CONSTRAINT "credential_access_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_credential_secret_id_secret_records_id_fk" FOREIGN KEY ("credential_secret_id") REFERENCES "public"."secret_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_services" ADD CONSTRAINT "organization_services_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_services" ADD CONSTRAINT "organization_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_services" ADD CONSTRAINT "organization_services_oauth_client_secret_id_secret_records_id_fk" FOREIGN KEY ("oauth_client_secret_id") REFERENCES "public"."secret_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_services" ADD CONSTRAINT "organization_services_api_key_secret_id_secret_records_id_fk" FOREIGN KEY ("api_key_secret_id") REFERENCES "public"."secret_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_records" ADD CONSTRAINT "secret_records_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_organization_enabled_idx" ON "api_keys" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE INDEX "credential_access_org_external_user_idx" ON "credential_access_logs" USING btree ("organization_id","external_user_id");--> statement-breakpoint
CREATE INDEX "connect_sessions_org_external_user_idx" ON "connect_sessions" USING btree ("organization_id","external_user_id");--> statement-breakpoint
CREATE INDEX "connect_sessions_expires_at_idx" ON "connect_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_org_external_user_service_unique" ON "connections" USING btree ("organization_id","external_user_id","service_id");--> statement-breakpoint
CREATE INDEX "connections_org_external_user_idx" ON "connections" USING btree ("organization_id","external_user_id");--> statement-breakpoint
CREATE INDEX "connections_status_expires_at_idx" ON "connections" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "secret_records_org_purpose_idx" ON "secret_records" USING btree ("organization_id","purpose");--> statement-breakpoint
CREATE INDEX "secret_records_key_id_idx" ON "secret_records" USING btree ("key_id");--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "api_keys"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "credential_access_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credential_access_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "credential_access_logs_tenant_isolation" ON "credential_access_logs"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "connect_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connect_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "connect_sessions_tenant_isolation" ON "connect_sessions"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "connections_tenant_isolation" ON "connections"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "organization_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_services" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organization_services_tenant_isolation" ON "organization_services"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "outbox_events_tenant_isolation" ON "outbox_events"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "secret_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "secret_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "secret_records_tenant_isolation" ON "secret_records"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));
