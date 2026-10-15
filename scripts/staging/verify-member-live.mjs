// Live checks against the already running Members staging server. Does not restart it.
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';

const origin = new URL(process.env.MEMBER_STAGING_ORIGIN ?? '');
assert.equal(origin.protocol, 'https:');
assert.ok(origin.hostname.endsWith('.trycloudflare.com'));
assert.equal(process.env.GARMONPAY_STAGING_SUPABASE_REF, 'bhxheuaoofiklsaurqlu');
assert.equal(process.env.MEMBER_STAGING_SUPABASE_URL, 'https://bhxheuaoofiklsaurqlu.supabase.co');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://bhxheuaoofiklsaurqlu.supabase.co');
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.match(secret ?? '', /^sb_secret_[A-Za-z0-9_-]{24,}$/);
const serverStartedAt = process.env.MEMBER_STAGING_SERVER_STARTED_AT;
assert.ok(serverStartedAt);

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = BigInt('0x' + bytes.toString('hex')), result = '';
  while (n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = '1' + result; }
  return result;
}
function actor() {
  const pair = generateKeyPairSync('ed25519');
  return { pair, wallet: base58(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)), cookies: new Map() };
}
const checks = [];
async function request(who, path, method = 'GET', body, requestOrigin = origin.origin) {
  const options = {
    method, redirect: 'manual',
    headers: { origin: requestOrigin, 'content-type': 'application/json', cookie: [...who.cookies].map(([name, value]) => name + '=' + value).join('; ') },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  let response = await fetch(new URL(path, origin), options);
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after') ?? 60);
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, Math.min(60000, Math.max(1000, seconds * 1000))));
    response = await fetch(new URL(path, origin), options);
  }
  for (const cookie of response.headers.getSetCookie()) {
    const [name, value] = cookie.split(';')[0].split('=');
    if (value) who.cookies.set(name, value); else who.cookies.delete(name);
    if (value && name === 'gp-solana-session') {
      assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Strict/i);
    }
  }
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 180) }; }
  return { status: response.status, data };
}
async function login(who, referralCode) {
  const challenge = await request(who, '/api/solana/auth/challenge', 'POST', { wallet: who.wallet });
  assert.equal(challenge.status, 200);
  assert.match(challenge.data.message, /does not authorize a transaction or transfer/);
  assert.match(challenge.data.message, new RegExp(origin.host.replace(/\./g, '\\.')));
  const signature = sign(null, Buffer.from(challenge.data.message), who.pair.privateKey).toString('base64');
  const verified = await request(who, '/api/solana/auth/verify', 'POST', { challengeId: challenge.data.challengeId, signature, ...(referralCode ? { referralCode } : {}) });
  assert.equal(verified.status, 200);
  assert.equal('token' in verified.data, false);
  const own = await request(who, '/api/solana/members/me');
  assert.equal(own.status, 200);
  assert.equal(own.data.member.wallet, who.wallet);
  return own.data.member;
}
async function png(color) {
  return 'data:image/png;base64,' + (await sharp({ create: { width: 48, height: 48, channels: 3, background: color } }).png().toBuffer()).toString('base64');
}

const db = createClient(process.env.MEMBER_STAGING_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const prior = await db.from('gp_sol_members').select('id,username,picture,wallet_public,created_at').like('username', 'qa_%').lt('created_at', serverStartedAt);
assert.equal(prior.error, null);
assert.ok(prior.data.length > 0, 'No pre-restart staging profiles were found');
const sample = prior.data.find(row => row.picture && row.wallet_public === false) ?? prior.data[0];
const recovered = await request({ cookies: new Map() }, '/api/solana/members?q=' + encodeURIComponent(sample.username.slice(0, 8)));
assert.equal(recovered.status, 200);
assert.equal(recovered.data.status, 'available');
const recoveredRow = recovered.data.members.find(member => member.username === sample.username);
assert.ok(recoveredRow, 'Running server did not return a profile saved before it started');
assert.equal(recoveredRow.id, sample.id);
if (sample.wallet_public === false) assert.equal(recoveredRow.wallet, null);
checks.push('Replacement server still serves member profiles saved before its process started');

const a = actor(), b = actor();
const first = await login(a);
const name = 'qa_' + randomBytes(6).toString('hex');
const firstPicture = await png('#6c2aaa');
const saved = await request(a, '/api/solana/members/me', 'PATCH', { actorId: first.id, username: name, biography: 'Live staging profile', picture: firstPicture, walletPublic: false });
assert.equal(saved.status, 200);
const reloaded = (await request(a, '/api/solana/members/me')).data.member;
assert.equal(reloaded.id, first.id);
assert.equal(reloaded.username, name);
assert.equal(reloaded.biography, 'Live staging profile');
assert.match(reloaded.picture, /^data:image\/jpeg;base64,/);
assert.notEqual(reloaded.picture, firstPicture);
checks.push('Signed wallet session saves a profile and reloads the normalized photo');

const replacement = await png('#d4a017');
const replaced = await request(a, '/api/solana/members/me', 'PATCH', { actorId: first.id, username: name, biography: 'Live staging profile', picture: replacement, walletPublic: false });
assert.equal(replaced.status, 200);
const replacedMember = (await request(a, '/api/solana/members/me')).data.member;
assert.notEqual(replacedMember.picture, reloaded.picture);
assert.match(replacedMember.picture, /^data:image\/jpeg;base64,/);
const removed = await request(a, '/api/solana/members/me', 'PATCH', { actorId: first.id, username: name, biography: 'Live staging profile', picture: null, walletPublic: false });
assert.equal(removed.status, 200);
assert.equal((await request(a, '/api/solana/members/me')).data.member.picture, null);
const corrupt = await request(a, '/api/solana/members/me', 'PATCH', { actorId: first.id, username: name, biography: 'Changed by corrupt upload', picture: 'data:image/png;base64,AAAA', walletPublic: true });
assert.equal(corrupt.status, 400);
const intact = (await request(a, '/api/solana/members/me')).data.member;
assert.equal(intact.biography, 'Live staging profile');
assert.equal(intact.picture, null);
assert.equal(intact.walletPublic, false);
checks.push('Photo replace, removal, reload, and corrupt-upload rejection preserve the saved profile');

const directory = await request({ cookies: new Map() }, '/api/solana/members?q=' + name.slice(3, 9));
assert.equal(directory.status, 200);
const listed = directory.data.members.find(member => member.username === name);
assert.ok(listed);
assert.equal(listed.wallet, null);
const exact = await request({ cookies: new Map() }, '/api/solana/members?username=' + name);
assert.equal(exact.data.members[0].wallet, null);
checks.push('Username search and the signed-out profile hide the wallet address');

const second = await login(b, first.referralCode);
assert.notEqual(second.id, first.id);
assert.equal((await request(b, '/api/solana/members/me', 'PATCH', { actorId: second.id, username: name, biography: '', picture: null, walletPublic: true })).status, 409);
for (let i = 0; i < 2; i++) assert.equal((await request(b, '/api/solana/members/follow', 'POST', { actorId: second.id, memberId: first.id, follow: true })).status, 200);
assert.equal((await request({ cookies: new Map() }, '/api/solana/members?username=' + name)).data.members[0].followers, 1);
assert.equal((await request(a, '/api/solana/members/me')).data.member.referrals, 1);
assert.equal((await request(b, '/api/solana/members/follow', 'POST', { actorId: second.id, memberId: first.id, follow: false })).status, 200);
assert.equal((await request({ cookies: new Map() }, '/api/solana/members?username=' + name)).data.members[0].followers, 0);
const repeat = await login(b, first.referralCode);
assert.equal(repeat.id, second.id);
assert.equal((await request(a, '/api/solana/members/me')).data.member.referrals, 1);
checks.push('Follow, unfollow, and first-signup referral attribution do not inflate on repeat login');

assert.equal((await request(a, '/api/solana/auth/logout', 'POST', {})).status, 200);
assert.equal((await request(a, '/api/solana/members/me')).status, 401);
const returned = await login(a);
assert.equal(returned.id, first.id);
assert.equal(returned.username, name);
assert.equal(returned.referralCode, first.referralCode);
assert.equal(returned.referrals, 1);
checks.push('Sign-out and sign-in recover the same permanent member, username, and referral link');

assert.equal((await request(a, '/api/wallet/fund', 'POST', {})).status, 503);
const { data: row, error } = await db.from('gp_sol_members').select('id,picture,wallet_public,referral_code').eq('id', first.id).single();
assert.equal(error, null);
assert.equal(row.id, first.id);
assert.equal(row.picture, null);
assert.equal(row.wallet_public, false);
assert.equal(row.referral_code, first.referralCode);
const anonymous = createClient(process.env.MEMBER_STAGING_SUPABASE_URL, process.env.MEMBER_STAGING_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const denied = await anonymous.from('gp_sol_members').select('id');
assert.ok(denied.error);
checks.push('Staging Supabase confirms the saved profile, and the publishable key cannot read member rows');

const evidence = {
  origin: origin.origin,
  permanentHosting: false,
  serverReplaced: false,
  preRestartProfilesStillServed: prior.data.length,
  automatedEd25519Wallets: true,
  realWalletApplicationAcceptance: false,
  physicalMobileAcceptance: false,
  devicePhotoSelectionAcceptance: false,
  financialOperationsEnabled: false,
  productionAccess: false,
  searchedUsername: name,
  checks,
};
if (process.env.MEMBER_HTTPS_EVIDENCE) await writeFile(process.env.MEMBER_HTTPS_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ ...evidence, searchedUsername: name }, null, 2));
