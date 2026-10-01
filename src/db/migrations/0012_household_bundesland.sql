ALTER TABLE "households" ADD COLUMN "bundesland" text;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_bundesland_valid" CHECK ("households"."bundesland" is null or "households"."bundesland" in (
        'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
        'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
      ));