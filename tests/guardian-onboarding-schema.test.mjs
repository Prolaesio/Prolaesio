import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schemaUrl = new URL('../supabase/migrations/20260722230000_guardian_onboarding_schema.sql', import.meta.url);
const functionsUrl = new URL('../supabase/migrations/20260722231000_guardian_onboarding_functions.sql', import.meta.url);

test('age policy is centralized and private age identity is not broadly writable', async () => {
  const [schema, functions] = await Promise.all([readFile(schemaUrl,'utf8'),readFile(functionsUrl,'utf8')]);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS public\.age_policy_configurations/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS public\.player_age_identities/);
  assert.match(functions,/CREATE OR REPLACE FUNCTION public\.evaluate_player_age_policy/);
  assert.doesNotMatch(schema,/GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*player_age_identities[^;]*authenticated/i);
});

test('invitation tokens are hashed, expiring, single-use, and email-bound', async () => {
  const [schema, functions] = await Promise.all([readFile(schemaUrl,'utf8'),readFile(functionsUrl,'utf8')]);
  assert.match(schema,/token_hash BYTEA NOT NULL UNIQUE/);
  assert.match(schema,/expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(functions,/extensions\.digest\(token_value, 'sha256'\)/);
  assert.match(functions,/invitation\.guardian_email <> actor_email/);
  assert.match(functions,/status NOT IN \('pending','sent','delivered','opened'\)/);
  assert.match(functions,/resend_attempts >= 5/);
  assert.match(functions,/INTERVAL '60 seconds'/);
});

test('under-policy-age writes are blocked at the database boundary', async () => {
  const functions = await readFile(functionsUrl,'utf8');
  assert.match(functions,/CREATE OR REPLACE FUNCTION public\.enforce_restricted_player_write/);
  assert.match(functions,/player_is_guardian_restricted\(row_user\)/);
  for (const table of ['wellness_logs','training_logs','calendar_events','injuries']) {
    assert.match(functions,new RegExp(`ARRAY\\[[^\\]]*'${table}'`));
  }
});

test('Guardian acceptance, account decision, privacy, correction, and age-out operations are RPC-only', async () => {
  const functions = await readFile(functionsUrl,'utf8');
  for (const name of ['guardian_accept_invitation','guardian_decide_player_account','player_decide_adult_guardian_access','player_request_dob_correction','revoke_guardian_relationship','create_guardian_privacy_request']) {
    assert.match(functions,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}`));
    assert.match(functions,new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}`));
  }
  assert.match(functions,/status='suspended'/);
  assert.match(functions,/status='adult_authorised'/);
});
