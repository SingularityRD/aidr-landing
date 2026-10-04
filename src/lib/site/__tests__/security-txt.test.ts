import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/security.txt/route";
import { SECURITY_TXT_EXPIRES } from "../config";
import { buildSecurityTxt } from "../security-txt";

describe("security.txt", () => {
  const saved = {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    mailbox: process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL,
  };
  afterEach(() => {
    if (saved.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved.site;
    if (saved.mailbox === undefined) delete process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL;
    else process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL = saved.mailbox;
  });

  it("contains the RFC 9116 required fields", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://aidr.example";
    delete process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL;
    const text = buildSecurityTxt();
    expect(text).toMatch(/^Contact: /m);
    expect(text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(text).toContain("Canonical: https://aidr.example/.well-known/security.txt");
    expect(text).toContain("Policy: https://aidr.example/security#disclosure");
  });

  it("falls back to the contact form, never to an unmonitored address", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://aidr.example";
    delete process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL;
    expect(buildSecurityTxt()).toContain("Contact: https://aidr.example/contact?topic=security");
    expect(buildSecurityTxt()).not.toContain("mailto:");
  });

  it("uses the configured security mailbox when present and valid", () => {
    process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL = "security@corp.example";
    expect(buildSecurityTxt()).toContain("Contact: mailto:security@corp.example");
    process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL = "not-an-address";
    expect(buildSecurityTxt()).not.toContain("mailto:");
  });

  it("has an Expires date that is in the future (re-issue reminder)", () => {
    const expires = new Date(SECURITY_TXT_EXPIRES).getTime();
    expect(Number.isNaN(expires)).toBe(false);
    expect(expires, "security.txt has expired: renew SECURITY_TXT_EXPIRES in lib/site/config.ts").toBeGreaterThan(Date.now());
  });

  it("is served as plain text", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toMatch(/^Contact: /m);
  });
});
