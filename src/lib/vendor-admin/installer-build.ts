/**
 * Start a per-customer installer build: dispatches the AIDR repository's
 * `customer-installer.yml` workflow with the signed customer packet inline
 * (packet_source=input). The workflow verifies the packet against the
 * product's license public-key registry before embedding it, and packages the
 * promoted release's already-signed bundles (MSI, optional setup EXE, deb, rpm,
 * tar.gz). The packet carries no secret, so passing it as an input is safe.
 *
 *   AIDR_GITHUB_DISPATCH_TOKEN  fine-grained token: Actions read and write on the AIDR repository
 *   AIDR_GITHUB_REPOSITORY      default SingularityRD/aidr
 *   AIDR_GITHUB_WORKFLOW_REF    default master (the workflow runs only from the default branch)
 */
export const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+-rc\.(0|[1-9][0-9]{0,3})$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW = "customer-installer.yml";

export class InstallerBuildError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InstallerBuildError";
  }
}

export interface BuildConfig {
  token: string;
  repository: string;
  ref: string;
}

export function installerBuildConfig(env: NodeJS.ProcessEnv = process.env): BuildConfig | null {
  const token = (env.AIDR_GITHUB_DISPATCH_TOKEN ?? "").trim();
  if (!token) return null;
  const repository = (env.AIDR_GITHUB_REPOSITORY ?? "SingularityRD/aidr").trim();
  const ref = (env.AIDR_GITHUB_WORKFLOW_REF ?? "master").trim();
  if (!REPOSITORY.test(repository) || !/^[A-Za-z0-9._/-]{1,200}$/.test(ref)) {
    throw new InstallerBuildError("AIDR_GITHUB_REPOSITORY or AIDR_GITHUB_WORKFLOW_REF is malformed", 503);
  }
  return { token, repository, ref };
}

/** Where the build's runs are listed. */
export function workflowRunsUrl(config: Pick<BuildConfig, "repository">): string {
  return `https://github.com/${config.repository}/actions/workflows/${WORKFLOW}`;
}

export async function dispatchInstallerBuild(
  config: BuildConfig,
  build: { customerId: string; releaseTag: string; packetJson: string; buildExe: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<{ runsUrl: string }> {
  if (!RELEASE_TAG.test(build.releaseTag)) throw new InstallerBuildError("the release must be a promoted vX.Y.Z-rc.N tag", 400);
  const response = await fetchImpl(`https://api.github.com/repos/${config.repository}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "aidr-vendor-admin",
    },
    body: JSON.stringify({
      ref: config.ref,
      inputs: {
        release_tag: build.releaseTag,
        customer_id: build.customerId,
        packet_source: "input",
        packet_b64: Buffer.from(build.packetJson, "utf8").toString("base64"),
        build_exe: build.buildExe,
      },
    }),
  });
  if (response.status !== 204 && response.status !== 200) {
    // GitHub's message only (never the request, which holds the token in a header).
    const detail = await response
      .json()
      .then((body: { message?: unknown }) => (typeof body?.message === "string" ? body.message.slice(0, 200) : ""))
      .catch(() => "");
    throw new InstallerBuildError(`GitHub refused the build (${response.status}${detail ? `: ${detail}` : ""})`, 502);
  }
  return { runsUrl: workflowRunsUrl(config) };
}
