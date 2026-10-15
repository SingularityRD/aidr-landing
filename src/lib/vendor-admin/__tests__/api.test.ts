import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/lib/control-plane/__tests__/helpers/fake-firestore";
import type { AccessResult } from "../access";
import { handleAdminRequest, type AdminApiDeps } from "../api";
import { AUDIT, CUSTOMERS, ISSUANCES, parseCustomerTerms, type VendorDb } from "../customers";
import { getLicenseSigningKey, licenseCanonicalJson } from "../license";
import { createPublicKey, verify } from "node:crypto";

const key = getLicenseSigningKey({
  AIDR_LICENSE_SIGNING_KEY_ID: "vector-2026",
  AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64: readFileSync(join(__dirname, "fixtures", "TEST-ONLY-signing-key.pkcs8.b64"), "utf8").trim(),
})!;
const registryKey = JSON.parse(readFileSync(join(__dirname, "fixtures", "aidr-registry.vector.json"), "utf8")).keys[0];

const admin: AccessResult = { ok: true, actor: { userId: "user_admin000000", email: "ops@singularityrd.com" } };
const NOW = new Date("2026-10-14T09:30:00Z");

const bilgem = {
  customer_id: "bilgem",
  legal_name: "TÜBİTAK BİLGEM",
  display_name: "TÜBİTAK BİLGEM",
  seats: "250",
  plan_id: "enterprise",
  deployment: "onprem",
  features: "premium_intel",
  starts_on: "2026-10-15",
  ends_on: "2027-10-14",
  grace_days: 30,
  control_plane_url: "https://aidr.bilgem.example/",
  sensitivity: "balanced",
  contact_email: "bt@bilgem.example",
  notes: "",
};

function setup(overrides: Partial<AdminApiDeps> = {}) {
  const store = new FakeFirestore();
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  const deps: AdminApiDeps = {
    access: async () => admin,
    db: store as unknown as VendorDb,
    signingKey: () => key,
    buildConfig: () => ({ token: "github_pat_test", repository: "SingularityRD/aidr", ref: "master" }),
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    ...overrides,
  };
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    handleAdminRequest(
      new Request(`https://aidr.singularityrd.com/api/admin/${path}`, {
        method,
        headers: {
          host: "aidr.singularityrd.com",
          ...(method === "GET" ? {} : { origin: "https://aidr.singularityrd.com", "content-type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("/"),
      deps,
    );
  return { store, call, fetchMock };
}

describe("vendor admin API", () => {
  it("answers nothing to anyone who is not a vendor admin", async () => {
    for (const denied of [
      { ok: false, status: 404, reason: "not_found" },
      { ok: false, status: 403, reason: "second_factor_required" },
      { ok: false, status: 503, reason: "unavailable" },
    ] as AccessResult[]) {
      const { call, store } = setup({ access: async () => denied });
      const response = await call("POST", "customers", bilgem);
      expect(response.status).toBe(denied.ok ? 200 : denied.status);
      expect(store.docs.size).toBe(0);
    }
  });

  it("refuses writes from another site or without a JSON body", async () => {
    const { call, store } = setup();
    expect((await call("POST", "customers", bilgem, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "customers", bilgem, { "content-type": "text/plain" })).status).toBe(403);
    expect(store.docs.size).toBe(0);
  });

  it("creates a company, signs its license and packet, serves the files and starts the installer build", async () => {
    const { call, store, fetchMock } = setup();
    const created = await call("POST", "customers", bilgem);
    expect(created.status).toBe(201);
    expect((await call("POST", "customers", bilgem)).status).toBe(409);

    const issued = await call("POST", "customers/bilgem/issue", {});
    expect(issued.status).toBe(201);
    const { issuance } = await issued.json();
    expect(issuance).not.toHaveProperty("license_json");
    expect(issuance).toMatchObject({ seats: 250, key_id: "vector-2026", issued_by: "ops@singularityrd.com", updates_until: "2027-11-13T23:59:59Z" });
    expect(issuance.license_id).toMatch(/^LIC-bilgem-20261014-[0-9a-f]{6}$/);

    const licenseResponse = await call("GET", `customers/bilgem/licenses/${issuance.license_id}/license.json`);
    expect(licenseResponse.headers.get("content-disposition")).toContain(`${issuance.license_id}.json`);
    const license = JSON.parse(await licenseResponse.text());
    expect(license.payload).toEqual({
      license_id: issuance.license_id,
      customer: "TÜBİTAK BİLGEM",
      customer_id: "bilgem",
      plan_id: "enterprise",
      seats: 250,
      features: ["premium_intel"],
      deployment: "onprem",
      issued_at: "2026-10-14T09:30:00Z",
      not_before: "2026-10-15T00:00:00Z",
      expires_at: "2027-10-14T23:59:59Z",
      grace_days: 30,
    });
    const message = Buffer.from(`aidr-license-v1\n${licenseCanonicalJson(license.payload)}`, "utf8");
    expect(verify(null, message, createPublicKey(registryKey.public_key_pem), Buffer.from(license.sig, "base64"))).toBe(true);

    const packetText = await (await call("GET", `customers/bilgem/licenses/${issuance.license_id}/customer-packet.json`)).text();
    const packet = JSON.parse(packetText);
    expect(packet.payload).toMatchObject({ customer_id: "bilgem", control_plane_url: "https://aidr.bilgem.example/", sensitivity: "balanced", display_name: "TÜBİTAK BİLGEM" });
    expect(packet.payload.license).toEqual(license);

    // Installer build: needs a promoted tag; sends the packet inline to customer-installer.yml.
    expect((await call("POST", `customers/bilgem/licenses/${issuance.license_id}/build`, { release_tag: "latest" })).status).toBe(400);
    const build = await call("POST", `customers/bilgem/licenses/${issuance.license_id}/build`, { release_tag: "v1.0.0-rc.3", build_exe: false });
    expect(build.status).toBe(202);
    expect((await build.json()).runs_url).toBe("https://github.com/SingularityRD/aidr/actions/workflows/customer-installer.yml");
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe("https://api.github.com/repos/SingularityRD/aidr/actions/workflows/customer-installer.yml/dispatches");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer github_pat_test");
    const dispatched = JSON.parse(String(init.body));
    expect(dispatched.ref).toBe("master");
    expect(dispatched.inputs).toMatchObject({ release_tag: "v1.0.0-rc.3", customer_id: "bilgem", packet_source: "input", build_exe: false });
    expect(Buffer.from(dispatched.inputs.packet_b64, "base64").toString("utf8")).toBe(packetText);

    // Recorded: the issuance, its build, and an audit trail of every action.
    const record = store.peek(`${CUSTOMERS}/bilgem/${ISSUANCES}/${issuance.license_id}`)!;
    expect(record.builds).toEqual([{ requested_at: NOW.toISOString(), requested_by: "ops@singularityrd.com", release_tag: "v1.0.0-rc.3", build_exe: false }]);
    expect(store.peek(`${CUSTOMERS}/bilgem`)).toMatchObject({ latest_license_id: issuance.license_id });
    const audit = store.childrenOf(AUDIT).map((path) => store.peek(path)!.action);
    expect(audit).toEqual(["customer.create", "license.issue", "installer.build"]);

    const detail = await (await call("GET", "customers/bilgem")).json();
    expect(detail.issuances).toHaveLength(1);
    expect(detail.issuances[0]).not.toHaveProperty("packet_json");
  });

  it("edits terms without touching an issued license; the customer id never changes", async () => {
    const { call, store } = setup();
    await call("POST", "customers", bilgem);
    const { issuance } = await (await call("POST", "customers/bilgem/issue", {})).json();
    const before = store.peek(`${CUSTOMERS}/bilgem/${ISSUANCES}/${issuance.license_id}`)!.license_json;
    const updated = await call("PUT", "customers/bilgem", { ...bilgem, customer_id: "other", seats: 500 });
    expect(updated.status).toBe(200);
    expect((await updated.json()).customer).toMatchObject({ customer_id: "bilgem", seats: 500 });
    expect(store.peek(`${CUSTOMERS}/bilgem/${ISSUANCES}/${issuance.license_id}`)!.license_json).toBe(before);
    expect(store.peek(`${CUSTOMERS}/other`)).toBeUndefined();
  });

  it("reports unavailable signing and building instead of half-doing them", async () => {
    const { call, store } = setup({ signingKey: () => null, buildConfig: () => null });
    await call("POST", "customers", bilgem);
    const issue = await call("POST", "customers/bilgem/issue", {});
    expect(issue.status).toBe(503);
    expect(store.childrenOf(`${CUSTOMERS}/bilgem/${ISSUANCES}`)).toHaveLength(0);
    const status = await (await call("GET", "signing-key")).json();
    expect(status).toEqual({ signing_configured: false, build_configured: false });
  });

  it("shows the signing key's registry entry for the AIDR trust root", async () => {
    const { call } = setup();
    const status = await (await call("GET", "signing-key")).json();
    expect(status.signing_configured).toBe(true);
    expect(status.entry).toMatchObject({ key_id: "vector-2026", algorithm: "ed25519", status: "active", not_after: null, public_key_pem: registryKey.public_key_pem });
    expect(status).not.toHaveProperty("private");
    expect(JSON.stringify(status)).not.toContain("PRIVATE KEY");
  });

  it("refuses GitHub's error without leaking the token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ message: "Workflow does not have 'workflow_dispatch' trigger" }, { status: 422 }));
    const { call } = setup({ fetch: fetchMock as unknown as typeof fetch });
    await call("POST", "customers", bilgem);
    const { issuance } = await (await call("POST", "customers/bilgem/issue", {})).json();
    const response = await call("POST", `customers/bilgem/licenses/${issuance.license_id}/build`, { release_tag: "v1.0.0-rc.3" });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain("422");
    expect(text).not.toContain("github_pat_test");
  });

  it("404s unknown customers, licenses and paths", async () => {
    const { call } = setup();
    expect((await call("GET", "customers/nobody")).status).toBe(404);
    expect((await call("GET", "customers/../x")).status).toBe(404);
    expect((await call("POST", "customers/nobody/issue", {})).status).toBe(404);
    expect((await call("GET", "customers/bilgem/licenses/LIC-x/license.json")).status).toBe(404);
    expect((await call("GET", "users")).status).toBe(404);
  });
});

describe("customer terms", () => {
  it("normalises a form and refuses what the license verifier would refuse", () => {
    const terms = parseCustomerTerms({ ...bilgem, customer_id: " Bilgem ", features: "a, b" });
    expect(terms).toMatchObject({ customer_id: "bilgem", seats: 250, features: ["a", "b"], grace_days: 30 });
    const refused: Array<[string, Record<string, unknown>]> = [
      ["customer_id", { customer_id: "-x" }],
      ["seats", { seats: "0" }],
      ["seats", { seats: "100001" }],
      ["ends_on", { ends_on: "2026-10-15" }],
      ["plan_id", { deployment: "airgap", plan_id: "team" }],
      ["control_plane_url", { control_plane_url: "http://aidr.example/" }],
      ["display_name", { display_name: "x".repeat(61) }],
      ["starts_on", { starts_on: "15.10.2026" }],
      ["grace_days", { grace_days: 91 }],
    ];
    for (const [field, change] of refused) {
      expect(() => parseCustomerTerms({ ...bilgem, ...change }), field).toThrow(expect.objectContaining({ field }));
    }
  });
});
