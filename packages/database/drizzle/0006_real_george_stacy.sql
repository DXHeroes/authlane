CREATE TABLE "mcp_server_tools" (
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"input_schema" jsonb NOT NULL,
	"declared_annotations" jsonb,
	"risk" text DEFAULT 'write' NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_server_tools_server_id_name_pk" PRIMARY KEY("server_id","name"),
	CONSTRAINT "mcp_server_tools_risk_check" CHECK ("mcp_server_tools"."risk" in ('read', 'write', 'destructive'))
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"server_url" text NOT NULL,
	"auth_type" text NOT NULL,
	"discovered_at" timestamp with time zone,
	"discovery_error" text,
	"oauth_metadata" jsonb,
	"oauth_client_id" text,
	"oauth_client_secret_id" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_servers_auth_type_check" CHECK ("mcp_servers"."auth_type" in ('oauth2', 'api_key')),
	CONSTRAINT "mcp_servers_id_prefix_check" CHECK ("mcp_servers"."id" like 'mcp-%')
);
--> statement-breakpoint
ALTER TABLE "mcp_server_tools" ADD CONSTRAINT "mcp_server_tools_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_oauth_client_secret_id_secret_records_id_fk" FOREIGN KEY ("oauth_client_secret_id") REFERENCES "public"."secret_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_servers_org_idx" ON "mcp_servers" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "mcp_servers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_servers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mcp_servers_tenant_isolation" ON "mcp_servers"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));--> statement-breakpoint
ALTER TABLE "mcp_server_tools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_server_tools" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mcp_server_tools_tenant_isolation" ON "mcp_server_tools"
  USING (EXISTS (
    SELECT 1 FROM "mcp_servers"
    WHERE "mcp_servers"."id" = "mcp_server_tools"."server_id"
      AND "mcp_servers"."organization_id" = current_setting('authlane.organization_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "mcp_servers"
    WHERE "mcp_servers"."id" = "mcp_server_tools"."server_id"
      AND "mcp_servers"."organization_id" = current_setting('authlane.organization_id', true)
  ));
