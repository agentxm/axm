import * as path from "node:path";

export const AXM_LOCAL_DEFAULT_REGISTRY_LOCATION = "http://localhost:4300";
export const AXM_LOCAL_DEFAULT_TELEMETRY = "0";

export interface AxmLocalInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

const withDefault = (value: string | undefined, fallback: string): string =>
  value != null && value.length > 0 ? value : fallback;

const getRemoteRegistryUrl = (location: string): string | undefined => {
  try {
    const url = new URL(location);
    return url.protocol === "http:" || url.protocol === "https:" ? location : undefined;
  } catch {
    return undefined;
  }
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
  const cliEntrypoint = path.join(repoRoot, "packages", "cli", "src", "main.ts");
  const registryLocation = withDefault(
    input.env["AXM_REGISTRY_LOCATION"],
    AXM_LOCAL_DEFAULT_REGISTRY_LOCATION,
  );
  const registryUrl = withDefault(
    input.env["AXM_REGISTRY_URL"],
    getRemoteRegistryUrl(registryLocation) ?? "",
  );

  return {
    command: "bun",
    args: [cliEntrypoint, ...input.argv],
    cwd: input.cwd,
    env: {
      ...input.env,
      AXM_REGISTRY_LOCATION: registryLocation,
      ...(registryUrl.length > 0 ? { AXM_REGISTRY_URL: registryUrl } : {}),
      AXM_TELEMETRY: withDefault(input.env["AXM_TELEMETRY"], AXM_LOCAL_DEFAULT_TELEMETRY),
    },
  };
};
