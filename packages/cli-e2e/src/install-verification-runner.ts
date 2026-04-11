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
  args: ["nx", "run", "cli:compile-host"],
  cwd: "repoRoot",
} as const satisfies InstallVerificationCommand;

const installSuiteCommand = {
  command: "pnpm",
  args: ["nx", "run", "cli-e2e:install-suite"],
  cwd: "repoRoot",
} as const satisfies InstallVerificationCommand;

const hasInstallBaseUrl = (installBaseUrl: string | undefined): boolean =>
  installBaseUrl !== undefined && installBaseUrl.length > 0;

export const createInstallVerificationCommandPlan = (
  installBaseUrl: string | undefined,
): ReadonlyArray<InstallVerificationCommand> =>
  hasInstallBaseUrl(installBaseUrl)
    ? [installSuiteCommand]
    : [compileHostCommand, installSuiteCommand];

export { resolveCommandExecutable };
