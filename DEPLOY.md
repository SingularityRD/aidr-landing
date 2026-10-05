# Deploying Singularity AIDR Landing to Vercel

## Prerequisites
- Vercel account with access to the project
- All required environment variables ready

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in all values. In Vercel, add these to **Project Settings → Environment Variables**:

| Variable | Type | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production | Clerk publishable key (must start with `pk_live_`) |
| `CLERK_SECRET_KEY` | Production | Clerk secret key (must start with `sk_live_`) |
| `CLERK_WEBHOOK_SECRET` | Production | Clerk webhook signing secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Production | `/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Production | `/signup` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Production | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Production | `/dashboard` |
| `FIREBASE_PROJECT_ID` | Production | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Production | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | Production | Firebase Admin service account private key |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Production | Firebase client API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Production | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Production | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Production | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Production | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Production | Firebase app ID |
| `POLAR_WEBHOOK_SECRET` | Production | Polar.sh webhook signing secret (Standard Webhooks; unsigned or timestamp-less deliveries are rejected) |
| `AIDR_BILLING_CHECKOUT_ENABLED` | Optional | `1` enables checkout. Default off: the billing page shows "by approved order, contact sales". Set only after an order is approved |
| `POLAR_ACCESS_TOKEN` | Only with checkout | Polar.sh API access token |
| `POLAR_PRICE_MONTHLY_ID` | Only with checkout | Product/price id of the approved order. No price is hard-coded in the app |
| `NEXT_PUBLIC_APP_URL` | Production | Public app URL (e.g. `https://aidr.run`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Production | Sentry DSN for error tracking |

## Build Settings

In Vercel project settings, ensure:
- **Framework Preset:** Next.js
- **Build Command:** `pnpm build`
- **Output Directory:** `.next`

## Polar Webhook Setup

In Polar.sh dashboard, set the webhook URL to:
```
{APP_URL}/api/webhooks/polar
```
Replace `{APP_URL}` with your production URL (e.g. `https://aidr.run/api/webhooks/polar`).

Polar is the primary production billing provider. The Lemon Squeezy webhook route
is retained only for legacy compatibility and should not be configured for new
production deployments unless a migration explicitly requires it.

## Deployment Steps

1. Push code to the connected Git repository (main branch)
2. Vercel will trigger a deployment automatically
3. Monitor the build logs for any errors
4. Verify the deployment URL loads correctly

## Post-Deploy Verification

- [ ] Homepage loads without errors
- [ ] Sign-in page works (`/login`)
- [ ] Sign-up page works (`/signup`)
- [ ] Dashboard is accessible after auth (`/dashboard`)
- [ ] Polar webhooks respond with 200 at `/api/webhooks/polar`
- [ ] Sentry is receiving errors (check Sentry dashboard)
- [ ] Firestore TTL policies are deployed (`firebase deploy --only firestore:indexes`); verify each `expire_at` policy is ACTIVE in the console
- [ ] Response carries a `Content-Security-Policy` with a per-request `'nonce-...'` and no `'unsafe-inline'` in `script-src`

## Data retention (code-backed)

Expiry is stamped by the code and enforced by Firestore TTL on a native timestamp field `expire_at`
(declared in `firestore.indexes.json` `fieldOverrides`; `firebase.json` only points at that file).
The ISO-string `expires_at` field remains the application-level check and drives opportunistic pruning.

| Collection (group) | Retention stamped | Written in |
|---|---|---|
| `device_codes` | 15 minutes | `lib/control-plane/device-auth.ts` |
| `install_codes` | 15 minutes | `lib/control-plane/install-code.ts` |
| `enrollment_tokens` | 30 minutes validity, row kept 7 more days | `app/api/v1/[[...action]]/route.ts` |
| `events` | 365 days deny/critical, 180 days ask/warning, 90 days other | `lib/control-plane/ingest.ts` |
| `control_plane_audit` | 90 days | `lib/control-plane/request-guard.ts` |
| `control_plane_idempotency` | request-specific (10 minutes for ingest, 30 days for billing webhooks) | `lib/control-plane/request-guard.ts` |
| `control_plane_rate_limits` | end of window + one window | `lib/control-plane/request-guard.ts` |

Rows written before `expire_at` existed have no timestamp and are not deleted by TTL; the opportunistic
pruner removes them by `expires_at`. Backfill `expire_at = expires_at` once if prompt removal matters.
Firestore deletes expired documents on a best-effort basis, typically within about a day of expiry.

## Device-flow credentials

`device_codes` is hash-only: the document id is the SHA-256 of the device code and only the digest of the
enrollment token is stored. The enrollment token is revealed in the device-poll response (each poll of an
approved session issues a fresh one and supersedes the previous); the access token is never stored, only its
non-secret claims, so an idempotent enroll retry re-signs the identical credential. Pre-existing plaintext rows
are rehashed and the plaintext dropped the first time they are touched (poll or enroll).

## Billing

Checkout is off by default. To enable it for an approved order: create the Polar product for that order, set
`POLAR_PRICE_MONTHLY_ID` and `POLAR_ACCESS_TOKEN`, then set `AIDR_BILLING_CHECKOUT_ENABLED=1`. No price is
configured or displayed by the app. Polar webhooks must be Standard Webhooks signed (id, timestamp, signature).
