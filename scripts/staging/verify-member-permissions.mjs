// Staging-only permission probe. Prints statuses and counts, never keys or rows.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';

const env = parse(readFileSync('/private/tmp/garmonpay-member-mobile-stage/.env.local'));
assert.equal(env.GARMONPAY_MEMBERS_STAGING, '1');
assert.equal(env.GARMONPAY_STAGING_SUPABASE_REF, 'bhxheuaoofiklsaurqlu');
assert.equal(env.MEMBER_STAGING_SUPABASE_URL, 'https://bhxheuaoofiklsaurqlu.supabase.co');
const url = env.MEMBER_STAGING_SUPABASE_URL;
const key = env.MEMBER_STAGING_SUPABASE_PUBLISHABLE_KEY;
assert.match(key ?? '', /^sb_publishable_[A-Za-z0-9_-]{20,}$/);

const tables = {
  gp_sol_identities: 'wallet_address',
  gp_sol_challenges: 'id',
  gp_sol_sessions: 'token_hash',
  gp_sol_members: 'id',
  gp_sol_member_follows: 'follower',
};
const functions = ['gp_sol_issue_challenge', 'gp_sol_consume_challenge', 'gp_sol_create_session', 'gp_sol_rotate_session', 'gp_sol_member_login', 'gp_sol_member_save', 'gp_sol_member_follow', 'gp_sol_member_directory', 'gp_sol_member_me', 'gp_sol_member_actor'];
const absent = '00000000-0000-0000-0000-000000000000';
const headers = {apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', prefer: 'return=minimal'};
const checks = [];

function denied(status, payload) {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const message = typeof payload?.message === 'string' ? payload.message : '';
  return status === 401 || status === 403 || code === '42501' || /permission denied/i.test(message);
}

for (const [table, column] of Object.entries(tables)) {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await fetch(`${url}/rest/v1/${table}?${column}=eq.${absent}`, {
      method,
      headers,
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    });
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = {}; }
    assert.equal(response.ok, false, `${method} ${table} was accepted`);
    assert.equal(denied(response.status, payload), true, `${method} ${table} returned ${response.status} ${payload.code ?? ''}`);
    checks.push({kind: 'table', name: table, method, status: response.status, code: payload.code ?? ''});
  }
}

for (const name of functions) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {method: 'POST', headers, body: '{}'});
  const text = await response.text();
  const denied = response.status === 401 || response.status === 403 || response.status === 404 || /permission denied|42501/i.test(text);
  assert.equal(response.ok, false, `rpc ${name} was accepted`);
  assert.equal(denied, true, `rpc ${name} returned ${response.status}`);
  checks.push({kind: 'rpc', name, method: 'POST', status: response.status});
}

const byStatus = {};
for (const check of checks) byStatus[check.status] = (byStatus[check.status] ?? 0) + 1;
console.log(JSON.stringify({
  project: 'bhxheuaoofiklsaurqlu',
  role: 'publishable',
  attempts: checks.length,
  allowed: checks.filter(check => check.status < 400).length,
  byStatus,
}, null, 2));
