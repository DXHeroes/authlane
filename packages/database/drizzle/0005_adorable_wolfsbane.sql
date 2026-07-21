CREATE TABLE "sandbox_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"mode" text NOT NULL,
	"provider" text,
	"model" text,
	"service_id" text,
	"tool_name" text,
	"risk" text,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_runs" ADD CONSTRAINT "sandbox_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_runs_org_created_at_idx" ON "sandbox_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "sandbox_runs_org_external_user_idx" ON "sandbox_runs" USING btree ("organization_id","external_user_id");--> statement-breakpoint
ALTER TABLE "sandbox_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sandbox_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sandbox_runs_tenant_isolation" ON "sandbox_runs"
  USING ("organization_id" = current_setting('authlane.organization_id', true))
  WITH CHECK ("organization_id" = current_setting('authlane.organization_id', true));
