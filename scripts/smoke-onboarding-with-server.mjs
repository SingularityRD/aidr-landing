import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

process.noDeprecation = true;

const port = process.env.SMOKE_PORT || "4568";
const host = process.env.SMOKE_HOST || "localhost";
const baseUrl = (process.env.SMOKE_BASE_URL || `http://${host}:${port}`).replace(/\/+$/, "");
const timeoutMs = Number.parseInt(process.env.SMOKE_SERVER_TIMEOUT_MS || "60000", 10);
const nextCli = "node_modules/next/dist/bin/next";
const buildIdPath = ".next/BUILD_ID";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(child) {
  const start = Date.now();
  let exited = false;
  let exitInfo = "";
  child.once("exit", (code, signal) => {
    exited = true;
    exitInfo = `server exited early with code ${code ?? "null"} and signal ${signal ?? "null"}`;
  });

  while (Date.now() - start < timeoutMs) {
    if (exited) throw new Error(exitInfo);
    if (await probe(`${baseUrl}/onboarding`)) return;
    await wait(500);
  }

  throw new Error(`Timed out waiting for Next production server at ${baseUrl}`);
}

function stopServer(child) {
  if (!child.pid || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

const env = {
  ...process.env,
  AIDR_DEMO_MODE: "1",
  NEXT_PUBLIC_AIDR_E2E_MODE: "1",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsubG9jYWw",
  SMOKE_BASE_URL: baseUrl,
};

let server;
try {
  if (await probe(`${baseUrl}/onboarding`)) {
    console.log(`Reusing existing smoke server at ${baseUrl}`);
  } else {
    if (!existsSync(buildIdPath)) {
      throw new Error("Missing .next build output. Run `pnpm build` before `pnpm smoke:onboarding:ci`.");
    }

    server = spawn(process.execPath, [nextCli, "start", "-p", port], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    server.stdout.on("data", (chunk) => process.stdout.write(chunk));
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));

    await waitForServer(server);
  }

  const result = spawnSync(process.execPath, ["scripts/smoke-onboarding.mjs"], {
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`smoke:onboarding failed with exit code ${result.status ?? "unknown"}`);
  }
} finally {
  if (server) stopServer(server);
}
