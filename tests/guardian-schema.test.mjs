import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260722190000_guardian_platform.sql', import.meta.url);

test('Guardian migration exposes narrow read and acknowledgement RPCs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guardian_mark_update_read/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guardian_acknowledge_update/);
  assert.match(sql, /guardian_user_id = auth\.uid\(\)/);
  assert.match(sql, /REVOKE ALL ON public\.guardian_profiles/);
});

test('Guardian migration does not grant sporting-data mutations', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['wellness_logs', 'training_logs', 'calendar_events', 'injuries']) {
    assert.doesNotMatch(sql, new RegExp(`GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*${table}[^;]*authenticated`, 'i'));
  }
});

test('relationship and permission checks gate sanitized data functions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /r\.status IN \('active','adult_authorised'\)/);
  assert.match(sql, /guardian_has_permission/);
  assert.match(sql, /RAISE EXCEPTION 'Linked player not found\.'/);
});
