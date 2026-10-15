# Sale-readiness audit: aidr.singularityrd.com (2026-10-15)

Scope: the public site and control-plane API in this repository (`aidr-landing`, Next.js 16.3.8, Clerk, Firestore,
Polar, deployed on Vercel), checked against the product repository (`aidr-restored`, HEAD `43db0581`,
2026-10-15). Branch: `fix/sale-readiness-2026-10-15`. Nothing has been pushed or deployed.

Severity: **Critical** blocks any sale or demo; **High** blocks an enterprise sale; **Medium** is expected to be
raised by a buyer's review; **Low/Info** is hygiene.

## Summary

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| SR-01 | Critical | Every API route handler (and `/status`) answers an empty 500 in production | Fixed in code; owner redeploys |
| SR-02 | High | Clerk is not configured in production, so sign-in, dashboard and authenticated API answer 503 | Owner action |
| SR-03 | High | Without Firebase credentials the server silently used the in-memory demo database and demo auth | Fixed |
| SR-04 | High | Contact form cannot deliver (no destination) and offered no other channel; security.txt points to it | Fixed in UI; owner action |
| SR-05 | High | Site claims were out of date: rule count, connector scope, real-host acceptance | Fixed |
| SR-06 | Medium | Enterprise matrix did not describe the capabilities added 13-15 Oct | Fixed |
| SR-07 | Medium | Sentry was never initialised on the server (no `instrumentation.ts`) | Fixed; owner sets DSN |
| SR-08 | High | Privacy, Terms and DPA are drafts; no SLA | Owner action (counsel) |
| SR-09 | High | No SOC 2, ISO 27001 or independent penetration test | Owner action |
| SR-10 | Medium | Product is NO-GO with no release cut; the hosted control plane is "not accepted for customer use" in the product docs | Owner decision |
| SR-11 | Medium | Scheduled jobs (delivery retry, case notifications) are never triggered | Owner action |
| SR-12 | Low | Hosting subprocessor listed as "to be confirmed" | Fixed (Vercel) |
| SR-13 | Low | `/status` publishes which secrets are missing | Owner decision |
| SR-14 | Low | Node.js version not pinned for Vercel | Owner action |
| SR-15 | Low | 404 page has no `<main>` landmark | Open |
| SR-16 | Info | Security headers, SEO and accessibility baseline | Good |
| SR-17 | Info | Demo data and fabricated metrics | None outside demo mode |

---

## SR-01: API route handlers return an empty 500 in production (Critical)

**Symptom (live, 2026-10-15).** Pages return 200. App routes return 503 `authentication_unavailable`, which is
the expected fail-closed answer when Clerk is not configured. But every route that loads Firebase Admin or the
logger returns `500` with `Content-Length: 0` for every method (GET, POST, OPTIONS):

- `/api/health`, `/api/ready`, `/api/contact`, `/api/webhooks/lemon`, `/v1/policy`, `/v1/revocations`,
  `/v1/device-start`
- the page `/status`, the only page that imports Firebase Admin

Responses carried `x-matched-path`, and the `x-vercel-id` values (e.g. `fra1::iad1::…`) show the function ran.
Route handlers that import neither package work: `/auth/callback` answers 307, `/robots.txt` and
`/.well-known/security.txt` answer 200. An empty body with a 500 is what Next.js sends when a route module's
async (ESM) imports reject inside the handler. It is not Vercel's `FUNCTION_INVOCATION_FAILED` page.

**Root cause.** For server external packages (here `firebase-admin` and `pino`, plus Sentry's
`import-in-the-middle`/`require-in-the-middle`), Turbopack emits
`import("firebase-admin-0826426b5d9dbc85/app")`. That name resolves through a link it creates at
`.next/node_modules/firebase-admin-<hash>` → `node_modules/.pnpm/firebase-admin@13.10.0/node_modules/firebase-admin`.

The repo installed with pnpm's default isolated layout. In that layout firebase-admin's own dependencies
(`google-auth-library`, `jsonwebtoken`, …) exist only as *siblings* inside `node_modules/.pnpm/…/node_modules`.
They are not visible from `/node_modules`. As soon as the deployment materialises that link as a directory
instead of a symlink, Node resolves the package's dependencies from the copy, cannot find them, and the import
fails. The production build used Vercel's newer Next.js adapter pipeline (assets under
`/_next/static/immutable/`), and its packaging is consistent with that behaviour.

**Evidence (reproduced in a Linux container, Node 22, from a clean `git archive` of `main`).**

1. A plain `next build` + `next start` works, both with and without Firebase credentials. So does a `standalone`
   output moved to another directory, and so do the functions from `vercel build` with
   `NEXT_ENABLE_ADAPTER=1` materialised from their `filePathMap` with symlinks preserved. That rules out
   missing traced files, Sentry wrapping, the proxy nonce headers, `dynamic`, runtime and Node version.
2. In the same adapter-built function, the one change of materialising `.next/node_modules/firebase-admin-<hash>`
   as a real directory reproduces production exactly: `/api/health` → `500`, empty body. The logged error was
   `Failed to load external module firebase-admin-0826426b5d9dbc85/app: Error: Cannot find module 'google-auth-library'`.
   `/api/contact` and `/v1/policy` fail the same way, on `pino-<hash>` and `firebase-admin-<hash>`.
3. With `nodeLinker: hoisted`, the same worst-case materialisation serves `/api/health` 200, `/api/contact` 405
   (GET), `/v1/policy` 503 `control_plane_unconfigured`, and `/api/ready` 503 JSON with real Firestore checks.

I cannot see Vercel's own builder or logs, so step 2 is a reproduction of the symptom, not a read of the
production stack trace. The fix below holds whichever way the platform materialises these links, and the
post-deploy checks below will confirm it.

**Fix (commit `b40e09f`).**

- `pnpm-workspace.yaml`: `nodeLinker: hoisted` (flat `node_modules`; the lockfile is unchanged).
- `/api/health` now imports only `src/lib/site/liveness.ts`, which has no dependencies. Liveness can no longer
  be taken down by an SDK.
- `/api/ready` (and therefore `/status`) loads Firebase Admin lazily. If it cannot be loaded, the database check
  reports `{"status":"fail","reason":"sdk_load_failed"}` with a 503 JSON body instead of an opaque 500.
- `scripts/verify-server-bundle.mjs` runs after `next build` (`pnpm build`). For every traced server entry it
  copies only the `.nft.json`-traced files into an empty sandbox, materialises each Turbopack external link as
  a directory, and imports every external the entry uses. The build fails if any import fails. On the old layout
  it fails (e.g. `firebase-admin-…/app (import): Cannot find module 'google-auth-library'`); on the new one it
  passes for all 48 entries.
- Regression tests: `src/__tests__/deployment-bundle.test.ts` covers the health import boundary, the
  `nodeLinker` setting, the build wiring, and readiness with an unloadable SDK.

**Owner action.**

1. Redeploy Production with **"Use existing Build Cache" turned off**, because the cached `node_modules` has the
   old layout.
2. Check the result:
   - `curl -i https://aidr.singularityrd.com/api/health` → `200` JSON
   - `/api/ready` → JSON (`503` until SR-02 env vars are set)
   - `/status` → `200`
   - `/v1/policy` → `401`/`503` JSON, not an empty 500
3. If `/api/ready` reports `database: sdk_load_failed`, the external-package issue is still present. The Sentry
   events (SR-07) will carry the stack trace.

## SR-02: Clerk not configured in production (High)

**Evidence.** `/dashboard` and `/api/v1/install-code` answer `503 {"error":"authentication_unavailable"}`. The
live CSP has no Clerk frontend origin derived from a publishable key, which happens only when
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is absent or invalid. In production (`VERCEL_ENV=production`), `pk_test_`
and `sk_test_` keys count as not configured (`src/lib/clerk-config.ts`).

**Owner action.** Set the live Clerk key pair (see the env table) and add the production domain to the Clerk
instance. Sign-in, onboarding and the dashboard cannot be demonstrated until this is done.

## SR-03: Fail-open fallback to demo services without Firebase credentials (High)

**Evidence.** In `src/lib/firebase/admin.ts`, missing or unparsable credentials outside demo mode switched to
`createMockFirestore()` and `createMockAuth()`:

- The Polar webhook (`/api/webhooks/polar`) would verify a signed billing event, write the entitlement into
  process memory and acknowledge it, so the event was lost.
- The internal jobs would read and write memory.
- `adminAuth.verifyIdToken()` accepted any token as the demo user.

**Fix (commit `3ffd29d`).** The mocks are now used only in demo mode. Otherwise `adminDb` and `adminAuth` throw
`FirebaseAdminUnavailableError` on any use. The Polar webhook answers `503` with `Retry-After: 300`, so Polar
redelivers. Tests: `src/lib/firebase/__tests__/admin-fail-closed.test.ts`.

## SR-04: Contact flow is a dead end (High)

**Evidence.**

- `/api/contact` currently 500s (SR-01).
- Once SR-01 is fixed it will answer `503 contact_unavailable` until `CONTACT_WEBHOOK_URL` is set.
- The form then said only "try again later".
- No `NEXT_PUBLIC_CONTACT_*_EMAIL` is configured; the live site shows no `mailto:`.
- `/.well-known/security.txt` names `https://aidr.singularityrd.com/contact?topic=security` as its RFC 9116
  `Contact`, so a security researcher has no working channel either.

**Fix (commits `c1415a6`, `2f80f4b`).**

- `/contact` renders the form only when a delivery destination is configured. Otherwise it says the form is not
  connected and lists the configured sales, security and privacy mailboxes, or says honestly that none is
  configured.
- A failed submission offers the matching mailbox.
- Tests are in `src/lib/site/__tests__/pages.test.tsx`.

**Owner action.**

- Set `CONTACT_WEBHOOK_URL`: an HTTPS Slack-compatible incoming webhook or ticket intake.
- Set at least `NEXT_PUBLIC_CONTACT_SALES_EMAIL` and `NEXT_PUBLIC_CONTACT_SECURITY_EMAIL` to monitored mailboxes.
  `security.txt` switches to `mailto:` automatically, but it is static, so these need a rebuild.
- Optional: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.

## SR-05: Product claims out of date (High)

The brief quoted "507/29". The product repository now counts **519 rules in 31 files**: `grep '^- id:'
threats/*.yaml` across 31 files. That matches its `CLAUDE.md:80` and is enforced by its
`scripts/check-doc-claims.mjs`.

| Claim on the site | Product repository today | Change |
| --- | --- | --- |
| 507 detection rules in 29 files | 519 rules, 31 files | Updated (`src/lib/site/claims.ts`) |
| Five connectors; Codex outside scope | Six in `deploy/native/support-matrix.json#soldConnectorScope`, Codex included | Codex CLI added with interception, coverage, install snippet and limits |
| "Real-host acceptance is not complete for any connector" | Claude Code 2.1.296, Codex CLI 0.141.0, OpenClaw 2026.9.6 and OpenCode 1.18.32 each have one real-host record (linux/x64, development build, 2026-10-11). Cursor and VS Code are "Preview — no real-host acceptance evidence yet" (`docs/compatibility-matrix.md`) | Per-connector acceptance shown on `/` and `/install`; preview marker on Cursor and VS Code; trust row updated |
| "Targets are Windows, Linux and macOS" | No macOS installer is offered (`docs/security/supported-versions.md`); no release cut (`docs/operations/first-release.md`) | Stated explicitly; no connector described as supported |

Commits: `0f80554`, `884c125`.

The claim guard (`claims-guard.test.ts`) now also loads the product's
`commercial-go-evidence-registry.json` from `../aidr-restored`. Before this it only looked in `../aidr`, which
does not exist here, so those 8 registry patterns were never enforced locally. They pass.
`product-facts.test.ts` pins the figures.

## SR-06: Enterprise matrix missing the 13-15 Oct capabilities (Medium)

Added or updated in `src/lib/site/enterprise.ts` (commit `5483ae7`). Each entry states the open acceptance.

| Capability | Managed | Self-hosted | Detail |
| --- | --- | --- | --- |
| Fleet enrollment for mass deployment | Roadmap | Partial | Fleet keys with machine cap, expiry of 365 days or less, revocation and audit; MSI/SCCM, Intune, GPO and Ansible recipes |
| Per-customer signed installers | Partial | Partial | MSI/EXE/deb/rpm/tar.gz with a vendor-signed customer packet. HSM/Key Vault Authenticode signing is wired, but **no code-signing certificate has been issued**. No macOS installer |
| Browser Guard for web AI assistants | Partial | Partial | MV3 extension for Chrome/Edge 120+ and Firefox 140+; ChatGPT, Claude, Gemini and Copilot; personal vs company accounts. Not in any store |
| SSO | (unchanged) | (unchanged) | Note now covers OIDC JIT provisioning (verified domains, never owner) and on-prem IdP with internal CA |
| SIEM | (unchanged) | (unchanged) | Note now covers syslog TLS/TCP/UDP, Splunk HEC, Elastic, Sentinel, signed webhook, outbox with dead letters; QRadar and Wazuh are guides only |
| Air-gapped operation | (unchanged) | (unchanged) | Note now covers the signed offline image bundle and licence-bound offline content packs |

## SR-07: Server error reporting never initialised (High → fixed)

**Evidence.** There was no `instrumentation.ts`. Next.js 15+ loads `sentry.server.config.ts` only from
`register()`, so no server error was ever reported. That is why SR-01 left no trace anywhere.

**Fix (commit `813120c`).**

- `src/instrumentation.ts` loads the Sentry config only when `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` is set, and
  never blocks start-up.
- `onRequestError` forwards request errors.
- Verified locally: the production server starts and serves with and without a DSN.

**Owner action.** Set `SENTRY_DSN` (server). For build-time source maps, also set `SENTRY_ORG`,
`SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`. The browser SDK stays consent-gated.

## SR-08: Legal documents are drafts (High, owner)

`/privacy`, `/terms` and `/dpa` are titled "(draft)" and say so. The availability target (99.9%) is "not an
SLA". Product gates COM-002, COM-003 and COM-013 are open.

**Owner action.** Have counsel approve the Privacy Policy, Terms/EULA and DPA, and decide on an SLA, before an
enterprise order.

## SR-09: No independent assurance (High, owner)

The trust center states correctly that there is no SOC 2 report, no ISO 27001 certificate and no independent
penetration test (SEC-EXT-001 open). This matches `docs/sales/security-faq.md:167` in the product repository.
The wording is accurate. The gap is the blocker.

**Owner action.**

- Commission the penetration test: `docs/security/pentest-scope-rfp.md` is ready.
- Prepare the security questionnaire pack from the product's `docs/security/whitepaper.md`.

## SR-10: Product status vs site positioning (Medium, owner decision)

- `PRODUCTION_SALES_GAPS.md` (2026-10-13) records **NO-GO**: 66 of 109 sub-features working.
- `docs/deployment/saas.md` says the hosted control plane "is not accepted for customer use today".
- `docs/control-plane.md:6` describes `aidr-landing` as the marketing site plus vendor admin panel. Yet this
  repository serves an agent control-plane API (`/v1/*`, `/api/v1/*`) and a managed dashboard offered as the
  14-day evaluation.

The site's copy is conservative ("controlled evaluation", nothing marked accepted). Two things still need
settling before a sale:

1. Which control plane a buyer's evaluation uses (this one, or the product's).
2. Whether the managed evaluation is approved, so the site and the product docs say the same thing.

## SR-11: Scheduled jobs are never triggered (Medium, owner)

`/api/internal/delivery-retry`, `/api/internal/incident-case-notifications` and
`/api/internal/delivery-case-notifications` are `POST` endpoints authorised by `AIDR_CRON_SECRET` (bearer or
`x-aidr-cron-secret`). The repository has no `vercel.json`, so nothing calls them. Vercel Cron could not call
them as written anyway: it sends `GET` with `CRON_SECRET`. Failed webhook deliveries are therefore never retried,
and case notifications are never sent.

**Owner action.** Set `AIDR_CRON_SECRET` (32 or more random bytes) and call the three endpoints from a scheduler
(e.g. a GitHub Actions `schedule`) with `POST` and `Authorization: Bearer <secret>`. Alternatively, ask for GET
handlers that accept Vercel Cron.

## SR-12: Hosting subprocessor "to be confirmed" (Low → fixed)

Live responses carry `Server: Vercel` and `x-vercel-id` with the `iad1` function region. `/security` now names
Vercel Inc. as the hosting subprocessor in use. The location is stated as observed, not as a residency
commitment. The product's `docs/deployment/data-residency.md` forbids residency claims. Commit `19acc7f`.

## SR-13: `/status` discloses configuration gaps (Low, owner decision)

`/status` and `/api/ready` list each readiness check by name, for example `agent_token_secret: not_configured`.
They contain no secrets or hostnames, but they tell anyone which controls are missing.

**Owner decision.** Either keep them public (transparent), or set `noindex` and reduce the public view to an
overall state.

## SR-14: Node.js version not pinned for Vercel (Low, owner)

`package.json` has no `engines.node`, and the Docker image uses Node 24.21. The automated edit adding
`"engines": {"node": "24.x"}` was held for review by the local Singularity AIDR policy hook, so it is not on
this branch.

**Owner action.** Either set the Vercel project's Node.js version to 24.x, or add the `engines` field after
review.

## SR-15: 404 page without a `<main>` landmark (Low, open)

Every public page has a skip link, `<main>`, exactly one `<h1>`, `lang="en"`, a canonical URL, a description,
Open Graph tags, and no `<img>` without `alt`. The not-found page lacks `<main>`. This was found on a local
production build crawl.

## SR-16: Security headers, SEO and accessibility baseline (Info)

**Headers (live).** Per-request nonce CSP:

- `script-src` uses `'strict-dynamic'`, with no `unsafe-inline` or `unsafe-eval` in production.
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.

Also set:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no `preload`)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- no `X-Powered-By`

`style-src 'unsafe-inline'` is a documented residual (inline React styles).

**SEO.**

- `robots.txt` disallows the app, API, auth and verify paths.
- The sitemap covers the public routes.
- Auth pages and `/verify` are `noindex`.
- `security.txt` is valid; its `Expires` date is 2027-04-01.

## SR-17: Demo data outside demo mode (Info)

- Every app page reads `demo-data` only behind `isDemoMode()` (`AIDR_DEMO_MODE=1` or
  `NEXT_PUBLIC_AIDR_E2E_MODE=1`).
- `/demo` redirects to the contact form.
- Public pages show no customer logos, testimonials or invented metrics. The only figures are the rule count and
  the evaluation terms, both sourced.
- The server-side demo fallback that existed outside demo mode is removed (SR-03).

**Owner check.** Make sure neither demo flag is set in the Production environment.

---

## Vercel environment variables (Production)

Set these in Vercel → Project → Settings → Environment Variables, scope **Production**. Then redeploy with the
build cache off. `NEXT_PUBLIC_*` values are inlined at build time, so changing them needs a rebuild.

### Required for the site, sign-in and the control plane

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://aidr.singularityrd.com` |
| `NEXT_PUBLIC_APP_URL` | `https://aidr.singularityrd.com` (used in device-verification URLs) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` from the production Clerk instance (`pk_test_` is rejected in production) |
| `CLERK_SECRET_KEY` | `sk_live_…` |
| `FIREBASE_PROJECT_ID` | Firestore project id |
| `FIREBASE_CLIENT_EMAIL` | service-account email |
| `FIREBASE_PRIVATE_KEY` | service-account private key, with newlines escaped as `\n` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web config (optional) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config (optional) |
| `AIDR_AGENT_TOKEN_SECRET` | at least 32 random characters (readiness fails if shorter) |

### Signed policy and entitlements (Ed25519)

| Variable | Value |
| --- | --- |
| `AIDR_POLICY_SIGNING_KEY_ID` | Key id agents pin. Must be set together with the next one, or the API answers 503 |
| `AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64` | base64 PKCS#8 DER of the Ed25519 private key |
| `AIDR_POLICY_SIGNATURE_TTL_HOURS` | optional, 1–720, default 24 |
| `AIDR_POLICY_SIGNING_SECRET` | legacy HMAC `policy_signature` for older agents; set it if any are deployed |
| `AIDR_ENTITLEMENT_SIGNING_KEY_ID` | used for entitlements, and for policy when the policy pair is unset. Must be set with the next one |
| `AIDR_ENTITLEMENT_SIGNING_PRIVATE_KEY_PKCS8_B64` | as above |
| `AIDR_ENTITLEMENT_TTL_HOURS` | optional, 1–720, default 168 |
| `AIDR_ENTITLEMENT_GRACE_HOURS` | optional, 0–168, default 72 |

### Contact, abuse protection and diagnostics

| Variable | Value |
| --- | --- |
| `CONTACT_WEBHOOK_URL` | HTTPS intake for the contact form (SR-04) |
| `NEXT_PUBLIC_CONTACT_SALES_EMAIL` | monitored sales mailbox |
| `NEXT_PUBLIC_CONTACT_SECURITY_EMAIL` | monitored security mailbox (becomes the `security.txt` Contact) |
| `NEXT_PUBLIC_CONTACT_PRIVACY_EMAIL` | monitored privacy mailbox |
| `NEXT_PUBLIC_CONTACT_SUPPORT_EMAIL` | optional |
| `NEXT_PUBLIC_CONTACT_LEGAL_EMAIL` | optional |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile (optional, recommended) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (optional, recommended) |
| `SENTRY_DSN` | server error reporting (SR-07) |
| `NEXT_PUBLIC_SENTRY_DSN` | browser, consent-gated (optional) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | source-map upload at build (optional) |
| `NEXT_PUBLIC_APP_VERSION` | optional; otherwise `VERCEL_GIT_COMMIT_SHA` is reported |

### Billing, exports and jobs

| Variable | Value |
| --- | --- |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` | Polar billing (readiness reports `billing_config` until both are set) |
| `POLAR_PRICE_MONTHLY_ID`, `POLAR_ENVIRONMENT` | Polar checkout |
| `AIDR_BILLING_CHECKOUT_ENABLED` | `1` only when self-serve checkout is approved |
| `AIDR_EXPORT_WEBHOOK_SECRET` | HMAC for signed event, incident and rollout webhook exports |
| `AIDR_CRON_SECRET` | bearer for the `/api/internal/*` jobs (SR-11) |

### Must NOT be set in Production

| Variable | Why |
| --- | --- |
| `AIDR_DEMO_MODE`, `NEXT_PUBLIC_AIDR_E2E_MODE` | would switch to demo data and demo auth |
| `NEXT_PUBLIC_AIDR_E2E_*` | test hooks |
| `AIDR_ENABLE_LEGACY_LEMON_BILLING` | legacy billing path |
| `NEXT_OUTPUT` | container builds only |
| `NEXT_DIST_DIR` | smoke builds only |

## Verification on this branch

- `pnpm lint` (0 errors; 4 existing warnings), `pnpm test`, and `pnpm build` (includes
  `verify-server-bundle`: 48 entries OK) all pass, as does `pnpm smoke:onboarding:ci`. The smoke was run with
  `SMOKE_PORT=4578` because an older Next.js server, started at 09:30 before this work, was still listening on the
  default port 4568.
- Linux reproduction: `vercel build` (CLI 64.2.0, `NEXT_ENABLE_ADAPTER=1`) on a clean tree.
  - Old layout: `verify-server-bundle` fails, and functions with a materialised external link return the
    production empty 500.
  - `main` plus `nodeLinker: hoisted`: both pass.
  - The final branch tree was checked with `pnpm build` (including the bundle check) on Windows only. A second
    `vercel build` run in the container was held by the local policy hook (rule CLT-AGENT-IRR-014 matches
    `vercel … --prod`, even offline).
- Not done: live probing after the first round was stopped by the local Singularity AIDR policy hook (rule
  AIDR-FLOW-001), so the live crawl in SR-15/SR-16 was repeated on a local production build.
