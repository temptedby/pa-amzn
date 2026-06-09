# Enabling the hello@phoneassured.com inbox (Gmail API)

How PA-AMZN reads Amazon's emails (rejection notices, approvals, verification
requests) from the `hello@phoneassured.com` mailbox. This replicates the
DES / Social Scene pattern — **Gmail API via Google OAuth with a stored refresh
token**, raw REST (no SDK) — not the claude.ai MCP connector.

`hello@phoneassured.com` is a **Google Workspace** mailbox (MX → `aspmx.l.google.com`),
so the Gmail API applies directly. Access is **read-only** (`gmail.readonly`) —
least privilege; we read Amazon mail, never send. Sending stays on Resend
(`alerts@phoneassured.com`).

## One-time setup

### Part 1 — Google Cloud console (William, ~10 min, signed in as hello@phoneassured.com)
A fresh project dedicated to PA-AMZN (keeps the Amazon business self-contained):
1. console.cloud.google.com → create project `phone-assured`.
2. APIs & Services → Library → enable **Gmail API**.
3. APIs & Services → OAuth consent screen → User type **Internal** (you own the
   phoneassured.com Workspace, so Internal needs no Google review).
4. Credentials → Create credentials → OAuth client ID → Application type
   **Desktop app** → name `PA-AMZN inbox reader`.
5. Put the client ID + secret in `.env.local`:
   ```
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   ```

### Part 2 — mint the refresh token (one command)
```
node scripts/gmail-auth-setup.mjs
```
Opens a Google consent URL. Sign in as **hello@phoneassured.com**, approve, and
the script prints `GMAIL_REFRESH_TOKEN=...`. Add that line to `.env.local`
(and to Vercel env for prod, like `SP_API_REFRESH_TOKEN`).

### Part 3 — read Amazon's mail
```
node scripts/find-amazon-email.mjs
```
Prints Amazon's advertising/API emails (newest first) — including the Ads API
rejection so we can pin the exact address field. Custom search:
```
node scripts/find-amazon-email.mjs "from:amazon.com newer_than:365d"
```

## Env vars (mirror the SP_API_* convention)
| Var | What |
|---|---|
| `GMAIL_CLIENT_ID` | OAuth client ID (Desktop app) |
| `GMAIL_CLIENT_SECRET` | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Long-lived token minted by the setup script |

All live in `.env.local` (gitignored, like the SP-API creds). Nothing secret is committed.

## Files
- `scripts/gmail-auth-setup.mjs` — one-time refresh-token minting (loopback OAuth).
- `scripts/find-amazon-email.mjs` — search + read Amazon emails from the inbox.

## Later (when we wire it into the app)
A typed `src/lib/google/gmail.ts` (same fetch pattern) for the daily cron to
watch for Amazon's approval / verification mail automatically. Not built yet —
the scripts cover the immediate need (read the rejection, unblock the address fix).
