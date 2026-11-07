// Applies every migration and runs every SQL test file in an in-memory Postgres (PGlite).
// It emulates only what Supabase provides that the SQL relies on: the auth schema/auth.uid(), the anon and
// authenticated roles, and Supabase's default privileges. This is NOT your real Supabase project.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const db = new PGlite({ extensions: { pgcrypto } })

await db.exec(`
  create schema extensions; create schema auth;
  create role anon nologin; create role authenticated nologin;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`)
await db.exec('create extension if not exists pgcrypto with schema extensions')

for (const f of readdirSync(join(root, 'migrations')).sort()) {
  await db.exec(readFileSync(join(root, 'migrations', f), 'utf8'))
  console.log('applied', f)
}

let failed = 0
for (const f of readdirSync(join(root, 'tests')).filter((x) => x.endsWith('.sql')).sort()) {
  const res = await db.exec(readFileSync(join(root, 'tests', f), 'utf8'))
  const rows = res.find((r) => r.fields?.some((x) => x.name === 'result'))?.rows ?? []
  const sum = res.find((r) => r.fields?.some((x) => x.name === 'failed'))?.rows?.[0]
  console.log(`\n== ${f}: ${sum.passed} passed, ${sum.failed} failed`)
  for (const r of rows.filter((x) => x.result === 'FAIL')) console.log('  FAIL', r.name, '=>', r.detail)
  failed += Number(sum.failed)
}
process.exit(failed ? 1 : 0)
