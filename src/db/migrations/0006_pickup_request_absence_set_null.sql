ALTER TABLE "pickup_requests" DROP CONSTRAINT "pickup_requests_absence_id_absences_id_fk";
--> statement-breakpoint
ALTER TABLE "pickup_requests" ALTER COLUMN "absence_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_absence_id_absences_id_fk" FOREIGN KEY ("absence_id") REFERENCES "public"."absences"("id") ON DELETE set null ON UPDATE no action;