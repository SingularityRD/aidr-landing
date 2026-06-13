# Singularity AIDR Web App (`aidr-landing`)

This repository is the **production web surface** for Singularity AIDR:

- marketing and public pages
- web authentication (Clerk)
- install guidance
- production dashboard pages for agents, events, incidents, billing, settings,
  policy rollout, and delivery operations
- optional web-to-local handoff for legacy localhost dashboard workflows

The current SaaS target is Clerk + Firestore + Polar in this app. The older
`aidr/packages/dashboard` Vite/Supabase app is a legacy local reference surface,
not the production control plane.

## Local Development

```bash
pnpm install
pnpm dev
# http://127.0.0.1:4567
```

Focused verification for the incident case ownership and team-assignment
surface:

```bash
pnpm test:incident-case
```

Release-candidate verification for this web surface:

```bash
pnpm verify:release-candidate
```

## Web-to-Local Handoff (Legacy Bridge)

We do not assume “same auth provider = seamless SSO” across different origins.

Instead, the web app performs an explicit token handoff to localhost after the user signs in:

```
http://127.0.0.1:5173/auth/callback#access_token=...&refresh_token=...&returnTo=/onboarding
```

Important pages:

- `/login`: web sign-in (GitHub / Google / Magic Link with CAPTCHA)
- `/onboarding`: bridge page that detects a local dashboard request and attempts a secure handoff
- `/verify?code=...`: bridge page that redirects the user to local verify on the machine that will authorize the device

## Auth Environment Variables

Set these in `.env.local` for Clerk + Firestore:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `AIDR_AGENT_TOKEN_SECRET` (>= 32 chars)
- `AIDR_CRON_SECRET` (>= 32 chars, required when enabling scheduled internal jobs)
- `AIDR_POLICY_SIGNING_SECRET` (>= 32 chars, recommended for signed runtime policy versions)

Firebase client config (for browser SDK usage):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID` (recommended)
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` (optional)
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (optional)

Firebase Admin (server-side):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Internal scheduler:

- `POST /api/internal/delivery-retry`
- Auth: `Authorization: Bearer $AIDR_CRON_SECRET`
- Body: `{ "uid": "clerk_or_demo_user_id", "limit": 10 }`
- Purpose: replays due `delivery_failures` rows whose `retry.next_retry_at`
  has elapsed, then writes replay event and audit evidence.
- `POST /api/internal/delivery-case-notifications`
- Auth: `Authorization: Bearer $AIDR_CRON_SECRET`
- Body: `{ "uid": "clerk_or_demo_user_id", "limit": 10 }`
- Purpose: sends overdue delivery failure case notifications to the configured
  security export webhook, then writes notification event and audit evidence.
- `POST /api/internal/incident-case-notifications`
- Auth: `Authorization: Bearer $AIDR_CRON_SECRET`
- Body: `{ "uid": "clerk_or_demo_user_id", "limit": 10 }`
- Purpose: sends assigned-overdue, open-overdue, and expired-snooze incident
  case escalations to the configured security export webhook, then writes
  notification event and audit evidence.
- Incident assignment uses `users/{uid}/team_members` as the team member
  snapshot registry. The incident-case API syncs the current Clerk user into
  that registry and can assign a case to a selected `owner_user_id` while
  preserving `assigned_by` actor evidence. Additional teammate records are
  expected to be populated by a future org-directory or SCIM sync; clients can
  read snapshots but cannot write them directly.
- Dashboard users can verify the saved destination from
  `/settings#security-export` with **Send test export**. The panel also exposes
  per-route controls for runtime deny events, policy rollout reminders,
  delivery failure escalations, and incident case escalations, plus additional
  SOC/SIEM/team webhook destinations. Missing route flags default to enabled
  for compatibility with existing saved destinations.
  The test uses `POST /api/v1/security-export-test`, writes control-plane audit
  evidence, and signs the payload with `AIDR_EXPORT_WEBHOOK_SECRET` when
  configured.

## Production

This app is the only public site. The local dashboard is not deployed.

Supported deployment targets:

- Vercel (recommended for Next.js)
- Google Cloud Run (supported via `Dockerfile`; see `DEPLOYMENT_CLOUD_RUN.md`)
