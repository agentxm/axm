import * as path from "node:path";

export const AXM_LOCAL_DEFAULT_REGISTRY_URL = "http://localhost:4300";
export const AXM_LOCAL_DEFAULT_TELEMETRY = "0";

export interface AxmLocalInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: NodeJS.ProcessEnv;
}

const withDefault = (value: string | undefined, fallback: string): string =>
  value != null && value.length > 0 ? value : fallback;

export const resolveAxmLocalRepoRoot = (scriptPath: string): string =>
  path.resolve(path.dirname(scriptPath), "..");

export const createAxmLocalInvocation = (input: {
  readonly scriptPath: string;
  readonly argv: ReadonlyArray<string>;
  readonly env: NodeJS.ProcessEnv;
}): AxmLocalInvocation => {
  const repoRoot = resolveAxmLocalRepoRoot(input.scriptPath);
  const cliEntrypoint = path.join(repoRoot, "packages", "cli", "src", "main.ts");

  return {
    command: "bun",
    args: [cliEntrypoint, ...input.argv],
    env: {
      ...input.env,
      AXM_REGISTRY_URL: withDefault(input.env["AXM_REGISTRY_URL"], AXM_LOCAL_DEFAULT_REGISTRY_URL),
      AXM_TELEMETRY: withDefault(input.env["AXM_TELEMETRY"], AXM_LOCAL_DEFAULT_TELEMETRY),
    },
  };
};
