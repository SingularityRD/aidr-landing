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
| `POLAR_ACCESS_TOKEN` | Production | Polar.sh API access token |
| `POLAR_WEBHOOK_SECRET` | Production | Polar.sh webhook signing secret |
| `POLAR_PRICE_MONTHLY_ID` | Production | Polar monthly price ID |
| `POLAR_PRICE_YEARLY_ID` | Production | Polar yearly price ID |
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
- [ ] Firestore TTL policies are configured in Firebase Console
