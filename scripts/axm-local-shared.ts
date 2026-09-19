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
      // A source run reports the plain package version, so it is
      // indistinguishable from a release in telemetry. Never report it.
      AXM_TELEMETRY: withDefault(input.env["AXM_TELEMETRY"], AXM_LOCAL_DEFAULT_TELEMETRY),
    },
  };
};
