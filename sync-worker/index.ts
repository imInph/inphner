/**
 * inphner sync worker (Cloudflare Workers): keeps Google Drive sync signed in.
 *
 * A browser on its own only ever gets an access token that dies after an
 * hour. Renewing one without the person clicking needs Google's refresh
 * token, and getting that needs the client secret, which can't live in a web
 * page. This worker is the only place the secret exists. It holds no data and
 * no database: the refresh token is sealed (AES-GCM, key in a worker secret)
 * and handed back to the browser, which sends the sealed blob when it wants a
 * fresh access token. The worker can open it; nobody else can.
 *
 *   POST /exchange { code }   → { accessToken, expiresIn, sealed, email }
 *   POST /refresh  { sealed } → { accessToken, expiresIn }   (401 = sign in again)
 *   POST /revoke   { sealed } → { ok }
 *
 * Secrets:  GOOGLE_CLIENT_SECRET, SEAL_KEY (32 random bytes, base64)
 * Vars:     GOOGLE_CLIENT_ID, ALLOWED_ORIGINS (comma-separated)
 */

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SEAL_KEY: string;
  ALLOWED_ORIGINS: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function key(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64(env.SEAL_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(value)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

export async function unseal(env: Env, sealed: string): Promise<string | null> {
  try {
    const bytes = unb64(sealed);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key(env), bytes.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** The email in Google's id_token. It comes straight from Google over TLS, so reading it is enough. */
function emailOf(idToken: unknown): string {
  if (typeof idToken !== 'string') return '';
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64(idToken.split('.')[1] ?? ''))) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : '';
  } catch {
    return '';
  }
}

async function google(env: Env, params: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin);
    const cors: Record<string, string> = allowed
      ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
      : {};
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (!allowed) return json(403, { error: 'origin' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json(405, { error: 'method' });

    let input: { code?: unknown; sealed?: unknown };
    try {
      input = await req.json() as typeof input;
    } catch {
      return json(400, { error: 'body' });
    }
    const path = new URL(req.url).pathname;

    if (path === '/exchange') {
      if (typeof input.code !== 'string') return json(400, { error: 'code' });
      // The popup code flow of Google Identity Services uses this redirect_uri.
      const r = await google(env, { code: input.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });
      if (r.status !== 200 || typeof r.body.access_token !== 'string') return json(400, { error: 'exchange' });
      // Google only sends a refresh token the first time someone consents; the page then asks again with prompt=consent.
      if (typeof r.body.refresh_token !== 'string') return json(409, { error: 'consent' });
      return json(200, {
        accessToken: r.body.access_token,
        expiresIn: Number(r.body.expires_in) || 3600,
        sealed: await seal(env, r.body.refresh_token),
        email: emailOf(r.body.id_token),
      });
    }

    if (path === '/refresh' || path === '/revoke') {
      const rt = typeof input.sealed === 'string' ? await unseal(env, input.sealed) : null;
      if (!rt) return json(401, { error: 'sealed' });
      if (path === '/revoke') {
        await fetch(REVOKE_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: rt }) });
        return json(200, { ok: true });
      }
      const r = await google(env, { refresh_token: rt, grant_type: 'refresh_token' });
      // invalid_grant: revoked, expired, or the password changed. Only a new sign-in fixes it.
      if (r.status === 400 || r.status === 401) return json(401, { error: 'grant' });
      if (r.status !== 200 || typeof r.body.access_token !== 'string') return json(502, { error: 'google' });
      return json(200, { accessToken: r.body.access_token, expiresIn: Number(r.body.expires_in) || 3600 });
    }

    return json(404, { error: 'path' });
  },
};
