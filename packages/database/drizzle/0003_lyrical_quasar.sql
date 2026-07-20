ALTER TABLE "organization_services" ADD COLUMN "tool_access_policy" text DEFAULT 'read_only' NOT NULL;--> statement-breakpoint
UPDATE "organization_services" SET "tool_access_policy" = 'full';--> statement-breakpoint
ALTER TABLE "organization_services" ADD CONSTRAINT "organization_services_tool_access_policy_check" CHECK ("organization_services"."tool_access_policy" in ('read_only', 'full'));
