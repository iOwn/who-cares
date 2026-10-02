ALTER TABLE "assignments" DROP CONSTRAINT "assignments_source_valid";--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "third_party_label" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_third_party_has_no_assignee" CHECK ("assignments"."source" <> 'third-party' or "assignments"."assignee_id" is null);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_source_valid" CHECK ("assignments"."source" in ('accepted-request', 'direct-claim', 'third-party'));