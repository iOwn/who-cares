CREATE TABLE "at_risk_escalations" (
	"household_id" text NOT NULL,
	"date" date NOT NULL,
	"event" text NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "at_risk_escalations_household_id_date_pk" PRIMARY KEY("household_id","date")
);
--> statement-breakpoint
CREATE TABLE "pending_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"coalesce_key" text NOT NULL,
	"recipient_id" text NOT NULL,
	"event" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_notifications_coalesce_key_unique" UNIQUE("coalesce_key")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "at_risk_escalations" ADD CONSTRAINT "at_risk_escalations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_notifications" ADD CONSTRAINT "pending_notifications_recipient_id_members_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;