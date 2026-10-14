import { checkVendorAdmin } from "@/lib/vendor-admin/access";
import { handleAdminRequest, type AdminApiDeps } from "@/lib/vendor-admin/api";
import { installerBuildConfig } from "@/lib/vendor-admin/installer-build";
import { getLicenseSigningKey } from "@/lib/vendor-admin/license";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deps: AdminApiDeps = {
  access: () => checkVendorAdmin(),
  db: adminDb,
  signingKey: () => getLicenseSigningKey(),
  buildConfig: () => installerBuildConfig(),
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
};

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  try {
    return await handleAdminRequest(request, path, deps);
  } catch (error) {
    logger.error({ err: error, path: path.join("/") }, "vendor admin request failed");
    return Response.json({ error: "internal_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
