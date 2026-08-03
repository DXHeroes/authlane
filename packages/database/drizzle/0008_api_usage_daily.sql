CREATE TABLE "api_usage_daily" (
	"organization_id" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_usage_daily_organization_id_day_pk" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "api_usage_daily" ADD CONSTRAINT "api_usage_daily_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_usage_daily" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_usage_daily_tenant_isolation" ON "api_usage_daily"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));
