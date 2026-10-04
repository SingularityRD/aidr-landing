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


## Public Website and Procurement Pages

The public pages (`/`, `/pricing`, `/pilot`, `/enterprise`, `/install`, `/security`, `/trust`,
`/privacy`, `/terms`, `/dpa`, `/support`, `/status`, `/contact`, `/compare`) are written against the
product evidence in the `aidr` repository. Rules for editing them:

- Product facts (rule count, evaluation terms, connector scope and limits) live in
  `src/lib/site/claims.ts`. Assurance status lives in `src/lib/site/trust.ts`, enterprise capability
  labels in `src/lib/site/enterprise.ts`, and subprocessors in `src/lib/site/subprocessors.ts`.
- `src/lib/site/__tests__/claims-guard.test.ts` fails the build if blocked claims appear (for example
  "launch-ready", "go live in minutes", "SOC 2 certified", public prices, "free forever"). When the
  sibling `aidr` checkout is present it also enforces that repository's
  `commercial-go-evidence-registry.json` claim patterns (override the path with `AIDR_CLAIM_REGISTRY`).
- `src/lib/site/__tests__/links.test.ts` checks every internal link and fragment and the sitemap.
- **Legal drafts:** `/privacy`, `/terms` and `/dpa` are not counsel-approved. They show a
  "Draft pending legal review" banner controlled by the single constant `LEGAL_DRAFT_PENDING_REVIEW`
  in `src/lib/site/config.ts`. Replace the page text, set `LEGAL_EFFECTIVE_DATE`, and flip the constant
  to remove the banner and the "TBD" label everywhere.
- **security.txt** is served at `/.well-known/security.txt`. Re-issue `SECURITY_TXT_EXPIRES` in
  `src/lib/site/config.ts` before it lapses (a test fails once it has).
- **Contact form** posts to `/api/contact`, which validates input, checks origin, rate limits, uses a
  honeypot and timing trap, and forwards to `CONTACT_WEBHOOK_URL`. With no destination it returns 503
  and the UI says the message was not sent. See `.env.example`.
- **Health:** `GET /api/health` (liveness) and `GET /api/ready` (real Firestore and Clerk checks,
  503 when a required dependency fails) return `no-store` JSON. `/status` renders the same checks.
- **Privacy:** no analytics or advertising trackers. Browser Sentry starts only after a visitor opts in
  (`src/lib/diagnostics.ts`); session replay is not used.
- **Headers:** CSP, HSTS (production), frame-ancestors, referrer and permissions policies are set in
  `next.config.ts`. The CSP derives the Clerk frontend host from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  so that variable must be set at **build** time.
- **Smoke test:** `pnpm smoke:onboarding:ci` builds its own demo bundle in `.next-smoke`, because the
  client reads the demo flag at build time. It never touches the production `.next` build.
## Production

This app is the only public site. The local dashboard is not deployed.

Supported deployment targets:

- Vercel (recommended for Next.js)
- Google Cloud Run (supported via `Dockerfile`; see `DEPLOYMENT_CLOUD_RUN.md`)
