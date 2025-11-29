ALTER TABLE "organization_services" ADD COLUMN "api_key_enc" text;--> statement-breakpoint
ALTER TABLE "organization_services" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "organization_services" ADD COLUMN "updated_at" timestamp DEFAULT now();