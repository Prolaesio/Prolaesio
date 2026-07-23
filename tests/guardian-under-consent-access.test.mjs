import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260723180000_guardian_under_consent_access.sql', import.meta.url);
const profileUrl = new URL('../components/ProfileForm.tsx', import.meta.url);
const storageUrl = new URL('../lib/storage.ts', import.meta.url);
const detailUrl = new URL('../components/guardian/pages/GuardianPlayerDetailPage.tsx', import.meta.url);

test('under-consent Guardian templates and existing relationships receive every sanitized permission', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /template\.template_key IN \('under13_primary', 'under13_secondary'\)/);
  assert.match(sql, /identity\.guardian_approval_required/);
  assert.match(sql, /CASE WHEN definition\.permission_key = 'player_profile_basics' THEN 'required' ELSE 'allowed' END/);
  assert.match(sql, /ON CONFLICT \(relationship_id, permission_key\) DO UPDATE/);
});

test('billing storage cannot contain a full card number and Guardian output is masked', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /card_last4 TEXT CHECK \(card_last4 IS NULL OR card_last4 ~ '\^\[0-9\]\{4\}\$'\)/);
  assert.doesNotMatch(sql, /\b(?:card_number|full_card_number|pan|cvc|cvv)\s+(?:TEXT|VARCHAR|BIGINT|NUMERIC)/i);
  assert.match(sql, /'maskedCard'.*'•••• ' \|\| summary\.card_last4/s);
  assert.match(sql, /identity\.guardian_approval_required/);
  assert.match(sql, /REVOKE ALL ON public\.player_billing_summaries FROM anon, authenticated/);
});

test('the Player DOB comes from the private self-service age-state RPC and is locked in profile', async () => {
  const [sql, profile, storage] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(profileUrl, 'utf8'),
    readFile(storageUrl, 'utf8'),
  ]);
  assert.match(sql, /'dateOfBirth',identity\.date_of_birth/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_get_my_guardian_state\(\) FROM PUBLIC, anon/);
  assert.match(profile, /getPlayerAgeState\(\)/);
  assert.match(profile, /disabled=\{dateOfBirthVerified\}/);
  const profileWrite = storage.match(/static async saveProfile[\s\S]*?\.upsert\(\{([\s\S]*?)\}, \{ onConflict: 'id' \}/)?.[1] ?? '';
  assert.doesNotMatch(profileWrite, /date_of_birth/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guardian_get_player_profile_summary/);
  assert.match(sql, /'dateOfBirth', identity\.date_of_birth/);
});

test('Guardian player detail renders only masked billing fields', async () => {
  const detail = await readFile(detailUrl, 'utf8');
  assert.match(detail, /loadGuardianBillingSummary/);
  assert.match(detail, /billing\.maskedCard/);
  assert.doesNotMatch(detail, /cardNumber|securityCode|cvc|cvv/i);
});
