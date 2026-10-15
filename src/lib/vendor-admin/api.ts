/**
 * The vendor admin API behind /api/admin/* (route: src/app/api/admin/[...path]/route.ts).
 *
 *   GET  customers                                     list
 *   POST customers                                     create
 *   GET  customers/{id}                                record + issued licenses
 *   PUT  customers/{id}                                update terms
 *   POST customers/{id}/issue                          sign a new license + customer packet
 *   GET  customers/{id}/licenses/{licenseId}/license.json | customer-packet.json   download
 *   POST customers/{id}/licenses/{licenseId}/build     start the installer build
 *   GET  signing-key                                   public key entry for the AIDR registry
 *
 * Every call passes checkVendorAdmin first; writes must come from this site
 * (Origin) as JSON.
 */
import { NextResponse } from "next/server";
import type { AccessResult } from "./access";
import {
  CustomerError,
  createCustomer,
  getCustomer,
  getIssuance,
  issueForCustomer,
  listCustomers,
  listIssuances,
  parseCustomerTerms,
  recordBuild,
  updateCustomer,
  type IssuanceRecord,
  type VendorDb,
} from "./customers";
import { InstallerBuildError, dispatchInstallerBuild, workflowRunsUrl, type BuildConfig } from "./installer-build";
import { LicenseIssueError, isoSeconds, publicKeyRegistryEntry, type SigningKey } from "./license";

export interface AdminApiDeps {
  access(): Promise<AccessResult>;
  db: VendorDb;
  signingKey(): SigningKey | null;
  buildConfig(): BuildConfig | null;
  fetch: typeof fetch;
  now(): Date;
}

const NO_STORE = { "Cache-Control": "no-store" };

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function error(status: number, code: string, message?: string, field?: string) {
  return json(status, { error: code, ...(message ? { message } : {}), ...(field ? { field } : {}) });
}

/** Writes only from this site's own pages: same Origin, JSON body. */
function sameOriginJson(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === host && (request.headers.get("content-type") ?? "").startsWith("application/json");
}

/** An issuance as listed: the signed files are downloaded separately. */
function issuanceSummary(record: IssuanceRecord) {
  const summary: Partial<IssuanceRecord> = { ...record };
  delete summary.license_json;
  delete summary.packet_json;
  return summary;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function handleAdminRequest(request: Request, path: string[], deps: AdminApiDeps): Promise<Response> {
  const access = await deps.access();
  if (!access.ok) return error(access.status, access.reason);
  const { actor } = access;
  const method = request.method;
  if (method !== "GET" && !sameOriginJson(request)) return error(403, "cross_origin");

  try {
    const [resource, id, sub, licenseId, file] = path;

    if (resource === "signing-key" && path.length === 1 && method === "GET") {
      const key = deps.signingKey();
      const build = deps.buildConfig();
      return json(200, {
        signing_configured: key !== null,
        ...(key ? publicKeyRegistryEntry(key, isoSeconds(deps.now().getTime())) : {}),
        build_configured: build !== null,
        ...(build ? { runs_url: workflowRunsUrl(build) } : {}),
      });
    }

    if (resource !== "customers") return error(404, "not_found");

    if (path.length === 1) {
      if (method === "GET") return json(200, { customers: await listCustomers(deps.db) });
      if (method === "POST") {
        const terms = parseCustomerTerms(await body(request));
        return json(201, { customer: await createCustomer(deps.db, terms, actor, deps.now()) });
      }
      return error(405, "method_not_allowed");
    }

    if (path.length === 2) {
      const customer = await getCustomer(deps.db, id);
      if (!customer) return error(404, "not_found");
      if (method === "GET") {
        const issuances = await listIssuances(deps.db, id);
        return json(200, { customer, issuances: issuances.map(issuanceSummary) });
      }
      if (method === "PUT") {
        const terms = parseCustomerTerms(await body(request), id);
        return json(200, { customer: await updateCustomer(deps.db, terms, actor, deps.now()) });
      }
      return error(405, "method_not_allowed");
    }

    if (path.length === 3 && sub === "issue" && method === "POST") {
      const key = deps.signingKey();
      if (!key) return error(503, "signing_unavailable", "This deployment has no license signing key (AIDR_LICENSE_SIGNING_KEY_ID / AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64).");
      const record = await issueForCustomer(deps.db, id, key, actor, deps.now());
      return json(201, { issuance: issuanceSummary(record) });
    }

    if (sub === "licenses" && licenseId) {
      const issuance = await getIssuance(deps.db, id, licenseId);
      if (!issuance) return error(404, "not_found");

      if (path.length === 5 && method === "GET" && (file === "license.json" || file === "customer-packet.json")) {
        const content = file === "license.json" ? issuance.license_json : issuance.packet_json;
        const name = file === "license.json" ? `${issuance.license_id}.json` : `customer-packet-${id}-${issuance.packet_id}.json`;
        return new Response(content, {
          status: 200,
          headers: { ...NO_STORE, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
        });
      }

      if (path.length === 5 && file === "build" && method === "POST") {
        const config = deps.buildConfig();
        if (!config) return error(503, "build_unavailable", "This deployment has no AIDR_GITHUB_DISPATCH_TOKEN.");
        const input = await body(request);
        const releaseTag = typeof input.release_tag === "string" ? input.release_tag.trim() : "";
        const buildExe = input.build_exe !== false;
        const result = await dispatchInstallerBuild(config, { customerId: id, releaseTag, packetJson: issuance.packet_json, buildExe }, deps.fetch);
        await recordBuild(deps.db, id, licenseId, { release_tag: releaseTag, build_exe: buildExe }, actor, deps.now());
        return json(202, { runs_url: result.runsUrl });
      }
    }
    return error(404, "not_found");
  } catch (caught) {
    if (caught instanceof CustomerError) return error(caught.status, "invalid", caught.message, caught.field);
    if (caught instanceof InstallerBuildError) return error(caught.status, "build_failed", caught.message);
    if (caught instanceof LicenseIssueError) return error(503, "signing_unavailable", caught.message);
    throw caught;
  }
}
