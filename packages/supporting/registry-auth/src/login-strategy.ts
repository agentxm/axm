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
  readonly CI?: string;
  readonly CODESPACES?: string;
}

const isTruthyEnvValue = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

const isSshWithoutDisplay = (env: LoginStrategyEnvironment): boolean => {
  const hasSsh =
    isTruthyEnvValue(env.SSH_CONNECTION) ||
    isTruthyEnvValue(env.SSH_CLIENT) ||
    isTruthyEnvValue(env.SSH_TTY);
  const hasDisplay = isTruthyEnvValue(env.DISPLAY) || isTruthyEnvValue(env.WAYLAND_DISPLAY);
  return hasSsh && !hasDisplay;
};

export const selectLoginStrategy = (
  options: LoginStrategyOptions,
  env: LoginStrategyEnvironment,
): LoginStrategy => {
  if (options.deviceCode || options.nonInteractive) return "device-code";
  if (isSshWithoutDisplay(env)) return "device-code";
  if (isTruthyEnvValue(env.CI)) return "device-code";
  if (isTruthyEnvValue(env.CODESPACES)) return "device-code";
  return "loopback";
};
