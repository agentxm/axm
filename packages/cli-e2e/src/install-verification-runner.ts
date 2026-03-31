export type InstallVerificationCommand = {
  readonly command: "pnpm";
  readonly args: ReadonlyArray<string>;
  readonly cwd: "packageRoot" | "repoRoot";
};

const resolveCommandExecutable = (
  command: InstallVerificationCommand["command"],
  platform: NodeJS.Platform,
): string => {
  if (command === "pnpm" && platform === "win32") {
    return "pnpm.cmd";
  }

  return command;
};

const compileHostCommand = {
  command: "pnpm",
  args: ["exec", "nx", "run", "cli:compile-host", "--outputStyle=static"],
  cwd: "repoRoot",
} as const satisfies InstallVerificationCommand;

const vitestCommand = {
  command: "pnpm",
  args: ["exec", "vitest", "run", "--config", "vitest.install.config.ts"],
  cwd: "packageRoot",
} as const satisfies InstallVerificationCommand;

const hasInstallBaseUrl = (installBaseUrl: string | undefined): boolean =>
  installBaseUrl !== undefined && installBaseUrl.length > 0;

export const createInstallVerificationCommandPlan = (
  installBaseUrl: string | undefined,
): ReadonlyArray<InstallVerificationCommand> =>
  hasInstallBaseUrl(installBaseUrl) ? [vitestCommand] : [compileHostCommand, vitestCommand];

export { resolveCommandExecutable };
