/**
 * Liveness: "the process is up and can answer a request".
 *
 * This module must stay dependency-free (no Firebase, no logger, no SDKs). /api/health imports only this
 * file, so a dependency that fails to load in a deployment cannot take the liveness probe down with it;
 * /api/ready is where dependency failures are reported. A unit test enforces the import boundary.
 */

export const SERVICE = "aidr-landing";

export type Liveness = {
  status: "ok";
  service: string;
  release: string;
  time: string;
  uptimeSeconds: number;
};

export function release(): string {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    "unknown"
  );
}

export function getLiveness(): Liveness {
  return {
    status: "ok",
    service: SERVICE,
    release: release(),
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}
