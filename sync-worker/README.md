# inphner sync worker

Google Drive sync needs one small piece of server: this Cloudflare Worker. It holds the Google
client secret and renews sign-ins, so sync keeps working without anyone clicking. It stores
nothing. See the comment at the top of `index.ts` for how it works.

Until `GOOGLE_CLIENT_ID` in `src/sync/sync.ts` is filled in, the app hides the Sync card and
behaves exactly as before.

## Setting it up (once)

**1. Google Cloud** (console.cloud.google.com)

1. Create a project called `inphner`.
2. APIs & Services → Library → enable **Google Drive API**.
3. Google Auth Platform → Branding: app name `inphner`, support email, home page
   `https://inphner.com`, privacy policy link.
4. Audience: **External**, then **Publish app**. In "Testing" mode Google kills sign-ins after
   7 days and only lets listed test users in.
5. Data access → add the scopes `openid`, `.../auth/userinfo.email` and
   `.../auth/drive.appdata` (inphner's hidden folder only; it can't see anything else in Drive).
6. Clients → Create client → **Web application**. Authorized JavaScript origins:
   `https://inphner.com` and `http://localhost`. No redirect URIs are needed.
   Keep the **Client ID** and **Client secret**.

**2. The worker** (from this folder)

```bash
npx wrangler login
npx wrangler secret put GOOGLE_CLIENT_SECRET
openssl rand -base64 32 | npx wrangler secret put SEAL_KEY
npx wrangler deploy
```

Before deploying, put the Client ID in `wrangler.toml` (`GOOGLE_CLIENT_ID`). Deploying creates
`sync.inphner.com` on the Cloudflare zone.

**3. The app**: set `GOOGLE_CLIENT_ID` in `src/sync/sync.ts`, `npm run build`, commit.

Never change `SEAL_KEY` after people have signed in. If you do, every signed-in device has to sign
in again.
