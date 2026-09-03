# Runtime stack: Next.js on Vercel Hobby, Neon, Resend, once-daily Vercel Cron

While pinning the stack (issue #8), three coherent, near-zero-cost shapes were on the table:
an always-on Fly.io machine (~$2/mo, no serverless caveats, unlimited cron precision), a
free Render web service (sleeps after 15 min idle, ~1 min cold start, no native cron), and
an all-serverless Vercel Hobby setup (free, but Hobby's fair-use policy is officially
non-commercial, and its Cron is capped at once per day).

We picked **Vercel Hobby**: **Next.js (App Router)** + **Neon** free Postgres
(scale-to-zero) + **Resend** free email (already decided in the Auth approach, issue #7) +
**Vercel Cron once/day** for the 48h at-risk check, with standard `web-push` + one VAPID
keypair + one service worker for push delivery. True $0 cost and the path of least friction
on Vercel outweighed the $2/mo Fly.io would have bought in avoided caveats, for a household
app whose whole team is comfortable accepting the non-commercial policy and a once-daily
cron.

**Consequences**: the once-daily cron is not a tight escalation trigger — it's a backstop.
The at-risk day state must already be computed live at read time regardless of when cron
last ran (already true per ADR-0003), so a parent opening the app between cron runs always
sees the correct state; only the *notification* for a newly-at-risk day can lag by up to a
day. No second external scheduler (QStash / cron-job.org) was added to tighten this — judged
acceptable for a whole-day-granularity chore app. Revisit if the once-daily notification
delay ever proves too coarse in practice.
