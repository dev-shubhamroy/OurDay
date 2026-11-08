#!/usr/bin/env bash
# One-shot production Web Push deployment for OurDay. Run from the repo root in your own terminal:
#   VAPID_FILE="/path/to/.vapid-private.json" VAPID_SUBJECT="mailto:you@example.com" bash supabase/scripts/deploy-push.sh
# Needs: supabase CLI logged in, node. Never prints the private key; the key file stays outside Git.
set -euo pipefail
REF=cncvntgqzfsxfzkeeiti
: "${VAPID_FILE:?set VAPID_FILE to the .vapid-private.json path}"
: "${VAPID_SUBJECT:?set VAPID_SUBJECT, e.g. mailto:you@example.com}"
PUB=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).public)" "$VAPID_FILE")
PRIV=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).private)" "$VAPID_FILE")
grep -q "$PUB" frontend/src/services/push.ts || { echo "Public key in app does not match the key file"; exit 1; }
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo "1/5 apply migration"; supabase db push --remote $REF --yes
echo "2/5 set function secrets (values hidden)"
supabase secrets set --project-ref $REF VAPID_PUBLIC_KEY="$PUB" VAPID_PRIVATE_KEY="$PRIV" VAPID_SUBJECT="$VAPID_SUBJECT" PUSH_SECRET="$SECRET" >/dev/null
echo "3/5 deploy send-push"; supabase functions deploy send-push --project-ref $REF --no-verify-jwt
echo "4/5 configure push_config"
SQL="insert into public.push_config (function_url, secret) values ('https://$REF.supabase.co/functions/v1/send-push', '$SECRET') on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;"
supabase db query --remote $REF "$SQL" >/dev/null 2>&1 || { echo "Run this in the Supabase SQL Editor instead (secret shown once):"; echo "$SQL"; }
echo "5/5 done. Next: run supabase/tests/push_security.sql in the SQL Editor (rolls back) and see README for device tests."
