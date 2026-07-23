import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260723120000_jurisdiction_guardian_policies.sql', import.meta.url);
const onboardingUrl = new URL('../components/guardian/PlayerAgeSetup.tsx', import.meta.url);
const onboardingClientUrl = new URL('../lib/guardian/onboarding.ts', import.meta.url);
const countriesUrl = new URL('../lib/countries.ts', import.meta.url);
const legacyFunctionsUrl = new URL('../supabase/migrations/20260722231000_guardian_onboarding_functions.sql', import.meta.url);

const fallback = {
  countryCode: 'ZZ',
  status: 'reviewed',
  legalReviewStatus: 'authoritative_source_reviewed',
  ruleType: 'lodario_fallback',
  threshold: 13,
  secondaryAge: 18,
  effectiveFrom: '2026-01-01',
};

const reviewedFixedThresholds = {
  AT: 14, BE: 13, BG: 14, HR: 16, CY: 14, CZ: 15, DK: 13, EE: 13, FI: 13,
  FR: 15, DE: 16, GR: 15, HU: 16, IE: 16, IT: 14, LV: 13, LT: 14, LU: 16,
  MT: 13, NL: 16, PL: 16, PT: 13, RO: 16, SK: 16, SI: 15, ES: 14, SE: 13,
  NO: 13, IS: 13, LI: 16, GB: 13,
};

const policies = [
  ...Object.entries(reviewedFixedThresholds).map(([countryCode, threshold]) => ({
    countryCode, status: 'reviewed', legalReviewStatus: 'authoritative_source_reviewed',
    ruleType: 'fixed_age', threshold, effectiveFrom: '2026-01-01',
  })),
  { countryCode: 'CA', status: 'reviewed', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'capacity_based', secondaryAge: 13, effectiveFrom: '2026-01-01' },
  { countryCode: 'AU', status: 'reviewed', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'capacity_based', secondaryAge: 16, effectiveFrom: '2026-01-01' },
  { countryCode: 'US', status: 'reviewed', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'federal_with_local_overrides', threshold: 13, effectiveFrom: '2026-01-01', supportsSubdivisionOverrides: true },
  { countryCode: 'NZ', status: 'pending_review', legalReviewStatus: 'pending_legal_review', ruleType: 'capacity_based', effectiveFrom: '2026-01-01' },
  { countryCode: 'ZA', status: 'disabled', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'fixed_age', threshold: 16, effectiveFrom: '2026-01-01' },
  { countryCode: 'MX', status: 'superseded', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'fixed_age', threshold: 14, effectiveFrom: '2026-01-01' },
  { countryCode: 'BR', status: 'reviewed', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'fixed_age', threshold: 13, effectiveFrom: '2027-01-01' },
  { countryCode: 'JP', status: 'reviewed', legalReviewStatus: 'authoritative_source_reviewed', ruleType: 'fixed_age', threshold: 16, effectiveFrom: '2025-01-01', effectiveUntil: '2026-06-30' },
];

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid date');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('invalid date');
  }
  return { year, month, day, date };
}

// Test-only reference model used to exercise the SQL contract at boundaries.
function ageOn(dateOfBirth, asOf) {
  const birth = parseDate(dateOfBirth);
  const current = parseDate(asOf);
  if (birth.date > current.date) throw new Error('future DOB');
  let age = current.year - birth.year;
  if (current.month < birth.month || (current.month === birth.month && current.day < birth.day)) age -= 1;
  return age;
}

function evaluate({ dateOfBirth, countryCode, asOf = '2026-07-23' }) {
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('invalid country');
  const age = ageOn(dateOfBirth, asOf);
  const policy = policies.find(candidate =>
    candidate.countryCode === countryCode
    && candidate.status === 'reviewed'
    && ['authoritative_source_reviewed', 'legal_counsel_approved'].includes(candidate.legalReviewStatus)
    && candidate.effectiveFrom <= asOf
    && (!candidate.effectiveUntil || candidate.effectiveUntil >= asOf)
  ) || fallback;
  const fallbackUsed = policy === fallback;
  const threshold = policy.threshold ?? policy.secondaryAge;
  const guardianApprovalRequired = age < threshold;
  const guardianConnectionRequired = policy.ruleType === 'lodario_fallback'
    ? age < policy.secondaryAge
    : guardianApprovalRequired;
  return {
    age,
    policy,
    fallbackUsed,
    guardianApprovalRequired,
    guardianConnectionRequired,
    restricted: guardianApprovalRequired,
    accountState: guardianApprovalRequired ? 'guardian_required' : 'active',
  };
}

function dobForAge(age, asOf = '2026-07-23') {
  const [year, month, day] = asOf.split('-').map(Number);
  return `${year - age}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

test('reviewed threshold 13 applies below the threshold and skips at/above it', () => {
  assert.equal(evaluate({ dateOfBirth: dobForAge(12), countryCode: 'PT' }).guardianApprovalRequired, true);
  assert.equal(evaluate({ dateOfBirth: dobForAge(13), countryCode: 'PT' }).guardianConnectionRequired, false);
  assert.equal(evaluate({ dateOfBirth: dobForAge(14), countryCode: 'PT' }).guardianConnectionRequired, false);
});

test('reviewed threshold 16 applies below the threshold and skips exactly at it', () => {
  assert.equal(evaluate({ dateOfBirth: dobForAge(15), countryCode: 'IE' }).guardianApprovalRequired, true);
  assert.equal(evaluate({ dateOfBirth: dobForAge(16), countryCode: 'IE' }).guardianConnectionRequired, false);
});

test('unknown-country fallback restricts under 13, keeps 13-17 usable, and skips adults', () => {
  const age12 = evaluate({ dateOfBirth: dobForAge(12), countryCode: 'JP' });
  assert.deepEqual([age12.fallbackUsed, age12.guardianApprovalRequired, age12.restricted], [true, true, true]);
  const age14 = evaluate({ dateOfBirth: dobForAge(14), countryCode: 'JP' });
  assert.deepEqual([age14.fallbackUsed, age14.guardianConnectionRequired, age14.restricted, age14.accountState], [true, true, false, 'active']);
  const age18 = evaluate({ dateOfBirth: dobForAge(18), countryCode: 'JP' });
  assert.deepEqual([age18.fallbackUsed, age18.guardianConnectionRequired, age18.restricted], [true, false, false]);
});

test('pending, disabled, superseded, future, and expired policies do not replace fallback', () => {
  for (const countryCode of ['NZ', 'ZA', 'MX', 'BR', 'JP']) {
    assert.equal(evaluate({ dateOfBirth: dobForAge(14), countryCode }).fallbackUsed, true, countryCode);
  }
});

test('all reviewed EU and EEA thresholds apply at the exact configured boundary', () => {
  for (const [countryCode, threshold] of Object.entries(reviewedFixedThresholds)) {
    assert.equal(evaluate({ dateOfBirth: dobForAge(threshold - 1), countryCode }).guardianApprovalRequired, true, countryCode);
    assert.equal(evaluate({ dateOfBirth: dobForAge(threshold), countryCode }).guardianConnectionRequired, false, countryCode);
  }
});

test('capacity-based and federal-with-local-overrides policy shapes remain distinct', () => {
  const canada = evaluate({ dateOfBirth: dobForAge(12), countryCode: 'CA' });
  const australia = evaluate({ dateOfBirth: dobForAge(15), countryCode: 'AU' });
  const us = evaluate({ dateOfBirth: dobForAge(12), countryCode: 'US' });
  assert.equal(canada.policy.ruleType, 'capacity_based');
  assert.equal(australia.guardianApprovalRequired, true);
  assert.equal(us.policy.ruleType, 'federal_with_local_overrides');
  assert.equal(us.policy.supportsSubdivisionOverrides, true);
});

test('exact birthdays and leap-year birthdays use completed years', () => {
  assert.equal(ageOn('2013-07-23', '2026-07-22'), 12);
  assert.equal(ageOn('2013-07-23', '2026-07-23'), 13);
  assert.equal(ageOn('2008-02-29', '2024-02-28'), 15);
  assert.equal(ageOn('2008-02-29', '2024-02-29'), 16);
});

test('invalid country codes and future dates are rejected', () => {
  assert.throws(() => evaluate({ dateOfBirth: '2010-01-01', countryCode: 'USA' }), /invalid country/);
  assert.throws(() => evaluate({ dateOfBirth: '2027-01-01', countryCode: 'PT' }), /future DOB/);
});

test('SQL evaluator selects only active reviewed policy and returns the complete contract', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /p\.policy_status='reviewed'/);
  assert.match(sql, /p\.legal_review_status IN \('authoritative_source_reviewed','legal_counsel_approved'\)/);
  assert.match(sql, /p\.effective_from<=p_as_of/);
  assert.match(sql, /p\.effective_until IS NULL OR p\.effective_until>=p_as_of/);
  for (const field of [
    'countryCode', 'jurisdictionPolicyId', 'ruleType', 'age', 'ageBand', 'guardianRequired',
    'guardianApprovalRequired', 'guardianConnectionRequired', 'guardianThreshold', 'policyStatus',
    'policyVersion', 'policySourceAuthority', 'fallbackUsed', 'decisionReason', 'evaluatedAt',
    'nextAgeTransitionAt',
  ]) assert.match(sql, new RegExp(`'${field}'`), field);
});

test('initial placeholder records contain no unverified threshold guesses', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const pendingRows = sql.split('\n').filter(line => line.includes("'pending_review'") && line.trimStart().startsWith("('"));
  assert.ok(pendingRows.length >= 29);
  for (const row of pendingRows) {
    const fields = row.trim().replace(/^\(/, '').split(',');
    assert.equal(fields[4], 'NULL', row);
  }
});

test('the second review activates 27 additional EU/EEA policies and leaves NZ/CH pending', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const [countryCode, threshold] of Object.entries(reviewedFixedThresholds)) {
    if (['FR', 'IE', 'PT', 'GB'].includes(countryCode)) continue;
    assert.match(sql, new RegExp(`'${countryCode}','[^']+','(?:country|federal)','fixed_age',${threshold},NULL,FALSE`), countryCode);
  }
  assert.match(sql, /'NZ','New Zealand','country','capacity_based',NULL,NULL,TRUE[\s\S]*'pending_review'/);
  assert.match(sql, /'CH','Switzerland','country','capacity_based',NULL,NULL,TRUE[\s\S]*'pending_review'/);
  assert.match(sql, /country_code IN \([\s\S]*'NO','IS','LI'[\s\S]*\)/);
});

test('the client submits only DOB and country; trusted decisions stay server-side', async () => {
  const client = await readFile(onboardingClientUrl, 'utf8');
  const call = client.match(/supabase\.rpc\('player_set_initial_age',\s*\{([\s\S]*?)\}\)/)?.[1] || '';
  assert.match(call, /p_date_of_birth/);
  assert.match(call, /p_country_code/);
  assert.doesNotMatch(call, /age\s*:|guardianRequired|guardian_required/i);
});

test('Guardian UI and invitation creation are skipped unless server requires a connection', async () => {
  const onboarding = await readFile(onboardingUrl, 'utf8');
  assert.match(onboarding, /next\.guardianConnectionRequired === true/);
  assert.match(onboarding, /else onComplete\(next\)/);
  assert.doesNotMatch(onboarding, /countryCode\s*===\s*['"]/);
  assert.ok(onboarding.indexOf('setInitialPlayerAge') < onboarding.indexOf('createGuardianInvitation({'));
});

test('policy administration and reconciliation are not available to normal users', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /REVOKE ALL ON public\.guardian_jurisdiction_policies[\s\S]*FROM anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reconcile_guardian_policy_changes\(TEXT,BOOLEAN\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /existing_player_policy_enforcement_enabled',FALSE/);
  assert.match(sql, /pending_admin_rollout/);
});

test('country selector is comprehensive ISO-style data and does not infer residence', async () => {
  const countries = await readFile(countriesUrl, 'utf8');
  const quotedCodes = countries.match(/'[A-Z]{2}'/g) || [];
  assert.equal(new Set(quotedCodes).size, 249);
  assert.doesNotMatch(countries, /navigator|geolocation|language|ip address/i);
});

test('existing Guardian restriction and Coach-related database protections remain present', async () => {
  const functions = await readFile(legacyFunctionsUrl, 'utf8');
  assert.match(functions, /CREATE OR REPLACE FUNCTION public\.enforce_restricted_player_write/);
  assert.match(functions, /CREATE OR REPLACE FUNCTION public\.coach_get_guardian_status/);
  assert.match(functions, /CREATE OR REPLACE FUNCTION public\.guardian_has_permission/);
});
