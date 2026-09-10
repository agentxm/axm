import * as path from "node:path";

export const AXM_LOCAL_DEFAULT_TELEMETRY = "0";
export const AXM_SOURCE_CONDITION_ARGUMENT = "--conditions=axm-source";

export interface AxmLocalInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

const readEnv = (value: string | undefined): string | undefined =>
  value != null && value.length > 0 ? value : undefined;

const withDefault = (value: string | undefined, fallback: string): string =>
  readEnv(value) ?? fallback;

const getRemoteRegistryUrl = (location: string): string | undefined => {
  try {
    const url = new URL(location);
    return url.protocol === "http:" || url.protocol === "https:" ? location : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The wrapper holds no opinion about which registry a local run targets: that
 * is the caller's choice. It only derives `AXM_REGISTRY_URL` for auth/API flows
 * when the caller selected an HTTP(S) location and did not set the URL itself.
 * With no location selected, the CLI's own default applies unchanged.
 */
const resolveRegistryEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const location = readEnv(env["AXM_REGISTRY_LOCATION"]);
  if (location === undefined) {
    return {};
  }

  const registryUrl = readEnv(env["AXM_REGISTRY_URL"]) ?? getRemoteRegistryUrl(location);

  return {
    AXM_REGISTRY_LOCATION: location,
    ...(registryUrl === undefined ? {} : { AXM_REGISTRY_URL: registryUrl }),
  };
};

export const resolveAxmLocalRepoRoot = (scriptPath: string): string =>
  path.resolve(path.dirname(scriptPath), "..");

export const createAxmLocalInvocation = (input: {
  readonly scriptPath: string;
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}): AxmLocalInvocation => {
  const repoRoot = resolveAxmLocalRepoRoot(input.scriptPath);
  const cliEntrypoint = path.join(repoRoot, "apps", "cli", "src", "main.ts");

  return {
    command: "bun",
    args: [AXM_SOURCE_CONDITION_ARGUMENT, cliEntrypoint, ...input.argv],
    cwd: input.cwd,
    env: {
      ...input.env,
      ...resolveRegistryEnv(input.env),
      // A source run reports the plain package version, so it is
      // indistinguishable from a release in telemetry. Never report it.
      AXM_TELEMETRY: withDefault(input.env["AXM_TELEMETRY"], AXM_LOCAL_DEFAULT_TELEMETRY),
    },
  };
};
