import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { seal, unseal, type Env } from '../../sync-worker/index.ts';

const env: Env = {
  GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret',
  SEAL_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  ALLOWED_ORIGINS: 'https://inphner.com,http://localhost',
};

const post = (path: string, body: unknown, origin = 'https://inphner.com') => new Request(`https://sync.inphner.com${path}`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

/** Stand in for Google's token endpoint; records what it was sent. */
function fakeGoogle(reply: (form: URLSearchParams) => [number, unknown]): URLSearchParams[] {
  const seen: URLSearchParams[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const form = new URLSearchParams(String(init.body));
    seen.push(form);
    const [status, body] = reply(form);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return seen;
}

test('worker: a sealed refresh token opens only with the right key', async () => {
  const s = await seal(env, 'rt-123');
  assert.equal(await unseal(env, s), 'rt-123');
  assert.equal(await unseal({ ...env, SEAL_KEY: btoa('x'.repeat(32)) }, s), null);
  assert.equal(await unseal(env, s.slice(0, -2) + 'AA'), null);
});

test('worker: refuses other origins', async () => {
  const res = await worker.fetch(post('/refresh', {}, 'https://evil.example'), env);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('worker: exchange → refresh round trip, secret stays on the worker', async () => {
  const idToken = `x.${btoa(JSON.stringify({ email: 'me@example.com' }))}.y`;
  const seen = fakeGoogle((f) => f.get('grant_type') === 'authorization_code'
    ? [200, { access_token: 'at1', expires_in: 3599, refresh_token: 'rt-9', id_token: idToken }]
    : [200, { access_token: 'at2', expires_in: 3599 }]);
  const ex = await worker.fetch(post('/exchange', { code: 'c0de' }), env);
  assert.equal(ex.status, 200);
  assert.equal(ex.headers.get('access-control-allow-origin'), 'https://inphner.com');
  const body = await ex.json() as { accessToken: string; sealed: string; email: string };
  assert.equal(body.accessToken, 'at1');
  assert.equal(body.email, 'me@example.com');
  assert.ok(!JSON.stringify(body).includes('rt-9') && !JSON.stringify(body).includes('secret'));
  assert.equal(seen[0]!.get('redirect_uri'), 'postmessage');

  const rf = await worker.fetch(post('/refresh', { sealed: body.sealed }), env);
  assert.equal((await rf.json() as { accessToken: string }).accessToken, 'at2');
  assert.equal(seen[1]!.get('refresh_token'), 'rt-9');
});

test('worker: missing refresh token asks for consent; revoked grant asks to sign in', async () => {
  fakeGoogle(() => [200, { access_token: 'at' }]);
  assert.equal((await worker.fetch(post('/exchange', { code: 'c' }), env)).status, 409);
  fakeGoogle(() => [400, { error: 'invalid_grant' }]);
  assert.equal((await worker.fetch(post('/refresh', { sealed: await seal(env, 'rt') }), env)).status, 401);
  assert.equal((await worker.fetch(post('/refresh', { sealed: 'junk' }), env)).status, 401);
});
