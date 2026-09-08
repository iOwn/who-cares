CREATE TABLE "children" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "children_household_unique" UNIQUE("household_id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"slot" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "members_household_slot_unique" UNIQUE("household_id","slot"),
	CONSTRAINT "members_email_unique" UNIQUE("email"),
	CONSTRAINT "members_slot_range" CHECK ("members"."slot" in (1, 2))
);
--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;