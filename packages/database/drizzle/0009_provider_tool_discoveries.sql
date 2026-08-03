CREATE TABLE "provider_tool_discoveries" (
	"organization_id" text NOT NULL,
	"service_id" text NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_count" integer DEFAULT 0 NOT NULL,
	"discovered_at" timestamp with time zone,
	"discovery_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_tool_discoveries_organization_id_service_id_pk" PRIMARY KEY("organization_id","service_id")
);
--> statement-breakpoint
ALTER TABLE "provider_tool_discoveries" ADD CONSTRAINT "provider_tool_discoveries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_tool_discoveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_tool_discoveries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "provider_tool_discoveries_tenant_isolation" ON "provider_tool_discoveries"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));
