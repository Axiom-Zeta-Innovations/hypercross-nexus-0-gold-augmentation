CREATE TABLE "intelligence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"signals" jsonb NOT NULL,
	"opportunity" jsonb NOT NULL,
	"proposal" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelligence_snapshots" ADD CONSTRAINT "intelligence_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_snapshots_user_id_idx" ON "intelligence_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "intelligence_snapshots_symbol_idx" ON "intelligence_snapshots" USING btree ("symbol");