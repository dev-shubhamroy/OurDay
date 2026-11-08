#!/usr/bin/env bash
# Production Web Push deployment for OurDay. Safe to re-run.
#   VAPID_FILE="/path/to/.vapid-private.json" VAPID_SUBJECT="mailto:you@example.com" bash supabase/scripts/deploy-push.sh
# Optional: ROTATE=1 forces a new PUSH_SECRET. Needs: supabase CLI (logged in) and node. Run from the repo root.
#
# Secrets handling: the VAPID private key and PUSH_SECRET are never printed and never put on a command line;
# they go through a 0600 temp file that is deleted on exit. The key file itself stays outside Git.
# Consistency: the database row public.push_config is the source of truth for PUSH_SECRET. A re-run reuses it
# (the Edge Function secret is left alone); a new secret is generated only when no row exists or ROTATE=1, and
# then the function secret and the row are updated together, function first, row last.
set -euo pipefail
umask 077

REF=cncvntgqzfsxfzkeeiti
FN_URL="https://${REF}.supabase.co/functions/v1/send-push"
: "${VAPID_FILE:?set VAPID_FILE to the .vapid-private.json path}"
: "${VAPID_SUBJECT:?set VAPID_SUBJECT, e.g. mailto:you@example.com}"
[ -r "$VAPID_FILE" ] || { echo "Cannot read VAPID_FILE" >&2; exit 1; }
[ -f supabase/functions/send-push/index.ts ] || { echo "Run this from the repository root" >&2; exit 1; }
command -v supabase >/dev/null && command -v node >/dev/null || { echo "supabase CLI and node are required" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

json_get() { node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))[process.argv[2]];if(!v)process.exit(1);process.stdout.write(v)" "$1" "$2"; }
PUB=$(json_get "$VAPID_FILE" public) || { echo "VAPID file has no public key" >&2; exit 1; }
json_get "$VAPID_FILE" private >/dev/null || { echo "VAPID file has no private key" >&2; exit 1; }
grep -q "$PUB" frontend/src/services/push.ts || { echo "The public key in the app does not match the key file" >&2; exit 1; }

echo "1/5 Apply migration (already-applied migrations are skipped)"
supabase db push --remote="$REF" --yes

echo "2/5 Check the existing push secret in the database"
EXISTING=""
if supabase db query --remote="$REF" --read-only --output json "select secret from public.push_config limit 1" >"$TMP/q.json" 2>/dev/null; then
  EXISTING=$(node -e "
    const f=(x)=>{if(x&&typeof x==='object'){if(typeof x.secret==='string')return x.secret;for(const k in x){const r=f(x[k]);if(r)return r}}return ''};
    try{process.stdout.write(f(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))))}catch{}" "$TMP/q.json")
else
  echo "Could not read push_config (is the migration applied?)" >&2; exit 1
fi
if [ -n "$EXISTING" ] && [ "${ROTATE:-0}" != "1" ]; then
  SECRET=$EXISTING; ROTATING=0; echo "   reusing the existing PUSH_SECRET"
else
  if [ -z "$EXISTING" ] && grep -q '"secret"' "$TMP/q.json"; then echo "push_config has a row but it could not be parsed; aborting (use ROTATE=1 to replace it)" >&2; exit 1; fi
  SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"); ROTATING=1; echo "   generating a new PUSH_SECRET"
fi

echo "3/5 Set function secrets (values hidden)"
{
  printf 'VAPID_PUBLIC_KEY=%s\n' "$PUB"
  printf 'VAPID_PRIVATE_KEY=%s\n' "$(json_get "$VAPID_FILE" private)"
  printf 'VAPID_SUBJECT=%s\n' "$VAPID_SUBJECT"
  if [ "$ROTATING" = 1 ]; then printf 'PUSH_SECRET=%s\n' "$SECRET"; fi
} >"$TMP/secrets.env"
supabase secrets set --remote="$REF" --env-file "$TMP/secrets.env" --yes >/dev/null
rm -f "$TMP/secrets.env"

echo "4/5 Deploy send-push"
supabase functions deploy send-push --remote="$REF" --no-verify-jwt --use-api --yes

echo "5/5 Write push_config"
cat >"$TMP/config.sql" <<SQL
insert into public.push_config (function_url, secret)
values ('${FN_URL}', '${SECRET}')
on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
SQL
if supabase db query --remote="$REF" --file "$TMP/config.sql" --yes >/dev/null; then
  echo "push_config updated."
else
  echo "Could not write push_config. Nothing printed; re-run this script (it will reuse or regenerate consistently)." >&2
  exit 1
fi
echo "Done. Next: run supabase/tests/push_security.sql in the SQL Editor (it rolls back)."
