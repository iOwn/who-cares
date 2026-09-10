#!/usr/bin/env bash
# Walk the human through the one-time notification secrets for a deploy
# (issue #55). Nothing here talks to Vercel — it prints values for you to paste
# into the Vercel project's Environment Variables, because that step needs your
# login and a human eye on which environment (Production / Preview) gets what.
#
# Re-runnable and side-effect-free except for generating a VAPID keypair.
set -euo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
pause() { read -rp "   ↵ when done "; }

bold "WhoCares — notification setup"
echo "See docs/notifications.md for the why. This prints what to set in Vercel."

step "1/3  Resend (email — the guaranteed channel)"
cat <<'EOF'
   - Sign in at https://resend.com , add + verify your sending domain.
   - Create an API key (Sending access is enough).
   - In Vercel → Project → Settings → Environment Variables, set:
       RESEND_API_KEY = re_xxxxxxxx
       EMAIL_FROM     = WhoCares <notify@your-verified-domain>
EOF
pause

step "2/3  VAPID keypair (web push)"
echo "   Generating a fresh keypair now. This pair is PERMANENT — rotating it"
echo "   invalidates every push subscription users have registered."
echo
if npx --yes web-push generate-vapid-keys 2>/dev/null; then
  :
else
  echo "   (could not run 'npx web-push' — install web-push and run"
  echo "    'npx web-push generate-vapid-keys' by hand)"
fi
cat <<'EOF'

   Set in Vercel (Production + Preview):
       NEXT_PUBLIC_VAPID_PUBLIC_KEY = <Public Key above>
       VAPID_PRIVATE_KEY            = <Private Key above>
       VAPID_SUBJECT               = mailto:you@your-domain
EOF
pause

step "3/3  Cron secret (protects /api/cron/at-risk)"
GENERATED="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
cat <<EOF
   Suggested value (random): ${GENERATED}

   Set in Vercel (Production + Preview):
       CRON_SECRET = ${GENERATED}

   Vercel sends it automatically as 'Authorization: Bearer <CRON_SECRET>' on
   the scheduled request. The schedule itself is in vercel.json (once/day).
EOF
pause

bold "Done. Redeploy for the new env vars to take effect."
echo "With none of these set the app still runs — it just sends nothing."
