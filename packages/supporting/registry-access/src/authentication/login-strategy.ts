/**
 * Login strategy selection for interactive auth commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type LoginStrategy = "loopback" | "device-code";

export interface LoginStrategyOptions {
  readonly deviceCode: boolean;
  readonly nonInteractive: boolean;
}

export interface LoginStrategyEnvironment {
  readonly SSH_CONNECTION?: string;
  readonly SSH_CLIENT?: string;
  readonly SSH_TTY?: string;
  readonly DISPLAY?: string;
  readonly WAYLAND_DISPLAY?: string;
  readonly BROWSER?: string;
  readonly CI?: string;
  readonly CODESPACES?: string;
  /** The host operating system; unknown means no platform rule applies. */
  readonly platform?: NodeJS.Platform;
  /** Linux running under Windows Subsystem for Linux, which opens Windows browsers. */
  readonly isWSL?: boolean;
}

const isTruthyEnvValue = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

const hasDisplay = (env: LoginStrategyEnvironment): boolean =>
  isTruthyEnvValue(env.DISPLAY) || isTruthyEnvValue(env.WAYLAND_DISPLAY);

const isSshWithoutDisplay = (env: LoginStrategyEnvironment): boolean => {
  const hasSsh =
    isTruthyEnvValue(env.SSH_CONNECTION) ||
    isTruthyEnvValue(env.SSH_CLIENT) ||
    isTruthyEnvValue(env.SSH_TTY);
  return hasSsh && !hasDisplay(env);
};

/**
 * Linux outside WSL opens a browser only through a display server or a
 * configured `BROWSER` command; with neither, loopback sign-in cannot start.
 */
const isLinuxWithoutBrowser = (env: LoginStrategyEnvironment): boolean =>
  env.platform === "linux" &&
  env.isWSL !== true &&
  !hasDisplay(env) &&
  !isTruthyEnvValue(env.BROWSER);

export const selectLoginStrategy = (
  options: LoginStrategyOptions,
  env: LoginStrategyEnvironment,
): LoginStrategy => {
  if (options.deviceCode || options.nonInteractive) return "device-code";
  if (isSshWithoutDisplay(env)) return "device-code";
  if (isTruthyEnvValue(env.CI)) return "device-code";
  if (isTruthyEnvValue(env.CODESPACES)) return "device-code";
  if (isLinuxWithoutBrowser(env)) return "device-code";
  return "loopback";
};
