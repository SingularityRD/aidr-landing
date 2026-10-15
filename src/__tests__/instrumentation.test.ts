import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { register, sentryServerEnabled } from "@/instrumentation";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("server instrumentation", () => {
  it("exists so Next.js actually loads the Sentry server config", () => {
    expect(existsSync(resolve(root, "src/instrumentation.ts"))).toBe(true);
    const source = readFileSync(resolve(root, "src/instrumentation.ts"), "utf8");
    expect(source).toContain('import("../sentry.server.config")');
    expect(source).toContain("captureRequestError");
  });

  it("is a no-op without a DSN", async () => {
    expect(sentryServerEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(sentryServerEnabled({ SENTRY_DSN: "https://k@o0.ingest.sentry.io/1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    const saved = { a: process.env.SENTRY_DSN, b: process.env.NEXT_PUBLIC_SENTRY_DSN };
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    try {
      await expect(register()).resolves.toBeUndefined();
    } finally {
      if (saved.a !== undefined) process.env.SENTRY_DSN = saved.a;
      if (saved.b !== undefined) process.env.NEXT_PUBLIC_SENTRY_DSN = saved.b;
    }
  });
});
