CREATE TABLE "childcare_pattern_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"weekdays" text[] NOT NULL,
	"effective_from" date NOT NULL,
	CONSTRAINT "childcare_pattern_versions_household_effective_from_unique" UNIQUE("household_id","effective_from")
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	CONSTRAINT "closures_household_date_unique" UNIQUE("household_id","date")
);
--> statement-breakpoint
ALTER TABLE "childcare_pattern_versions" ADD CONSTRAINT "childcare_pattern_versions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;