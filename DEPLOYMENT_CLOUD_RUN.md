# Cloud Run Deployment (aidr-landing)

This guide deploys `aidr-landing` (Next.js + Clerk + Firestore Admin) to Google Cloud Run.

`aidr/packages/dashboard` is intentionally localhost-only and is not deployed.

## 1) Prereqs

- A Google Cloud project with billing enabled
- Firestore database created (Native mode)
- A Clerk application (production keys)
- Polar billing configured for production subscriptions
- (Optional legacy) Lemon Squeezy only if you are validating the legacy webhook
  compatibility path

Enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com
```

## 2) Build & Push (Artifact Registry)

```bash
export PROJECT_ID="your-project-id"
export REGION="europe-west1"
export REPO="aidr"
export IMAGE="aidr-landing"

gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" || true

gcloud auth configure-docker "$REGION-docker.pkg.dev"

docker build -t "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE:latest" .
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE:latest"
```

## 3) Required Environment Variables

### Required (auth + control plane)

- `NEXT_PUBLIC_APP_URL` (example: `https://aidr.yourdomain.com`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `AIDR_AGENT_TOKEN_SECRET` (>= 32 chars)

### Required (Firebase client)

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`

### Required (Firebase Admin)

Pick one strategy:

1) Recommended: Provide a service account JSON as env vars:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (use `\\n` for newlines)

2) Advanced: Use Cloud Run service account + ADC.
This repo currently *expects* the env vars above for server routes and will return 500s if they are missing.

### Optional (security/ops)

- `AIDR_ENFORCE_PROD_KEYS=1` (recommended on Cloud Run)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (optional)

### Billing

Primary production provider:
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRICE_MONTHLY_ID`
- `POLAR_ENVIRONMENT` (`sandbox` or `production`)

Legacy compatibility only:
- `AIDR_ENABLE_LEGACY_LEMON_BILLING=1`
- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET` (or `LEMON_SQUEEZY_WEBHOOK_SECRET`)

## 4) Deploy

```bash
export SERVICE="aidr-landing"

gcloud run deploy "$SERVICE" \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE:latest" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-env-vars AIDR_ENFORCE_PROD_KEYS=1 \
  --set-env-vars NEXT_PUBLIC_APP_URL="https://aidr.yourdomain.com" \
  --set-env-vars NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..." \
  --set-env-vars CLERK_SECRET_KEY="sk_live_..." \
  --set-env-vars AIDR_AGENT_TOKEN_SECRET="min-32-chars-..." \
  --set-env-vars NEXT_PUBLIC_FIREBASE_API_KEY="..." \
  --set-env-vars NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..." \
  --set-env-vars NEXT_PUBLIC_FIREBASE_PROJECT_ID="..." \
  --set-env-vars FIREBASE_PROJECT_ID="..." \
  --set-env-vars FIREBASE_CLIENT_EMAIL="..." \
  --set-env-vars FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
```

## 5) Post-Deploy Checklist

- Clerk: add Cloud Run domain to allowed origins / redirect URLs
- Firestore: deploy rules and indexes (repo includes `firebase.json`, `firestore.rules`, `firestore.indexes.json`)
- Webhooks:
  - Polar: set webhook URL to `https://yourdomain/api/webhooks/polar`
  - Lemon: set webhook URL to `https://yourdomain/api/webhooks/lemon` only if
    the legacy compatibility path is enabled
- Verify onboarding:
  - Sign in on web
  - `/onboarding` -> generate install prompt -> open `/auth/{code}` link
