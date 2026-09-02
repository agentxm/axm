export interface CliOutputEnvironment {
  readonly stdoutIsTTY: boolean | undefined;
  readonly stderrIsTTY: boolean | undefined;
  readonly env: NodeJS.ProcessEnv;
}

export interface CliOutputPolicy {
  readonly colors: boolean;
  readonly animate: boolean;
  readonly interactiveActivity: boolean;
  readonly quiet: boolean;
}

const terminalFormattingPattern =
  // eslint-disable-next-line no-control-regex -- plain output must remove ANSI CSI and OSC sequences.
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\))/gu;

export const stripTerminalFormatting = (value: string): string =>
  value.replace(terminalFormattingPattern, "");

const hasNonEmptyEnv = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = env[name];
  return value !== undefined && value !== "";
};

const hasCi = (env: NodeJS.ProcessEnv): boolean => hasNonEmptyEnv(env, "CI");

const hasNoColor = (env: NodeJS.ProcessEnv): boolean => hasNonEmptyEnv(env, "NO_COLOR");

const hasForceColor = (env: NodeJS.ProcessEnv): boolean => {
  const value = env["FORCE_COLOR"];
  return value !== undefined && value !== "" && value !== "0";
};

const hasDisabledForceColor = (env: NodeJS.ProcessEnv): boolean => {
  const value = env["FORCE_COLOR"];
  return value !== undefined && (value === "" || value === "0");
};

const hasDumbTerminal = (env: NodeJS.ProcessEnv): boolean => env["TERM"] === "dumb";

export const resolveCliOutputPolicy = (
  environment?: Partial<CliOutputEnvironment> & { readonly quiet?: boolean },
): CliOutputPolicy => {
  // eslint-disable-next-line no-restricted-properties -- Centralized env access for CLI output policy detection.
  const env = environment?.env ?? process.env;
  const stdoutIsTTY = environment?.stdoutIsTTY ?? process.stdout.isTTY;
  const stderrIsTTY = environment?.stderrIsTTY ?? environment?.stdoutIsTTY ?? process.stderr.isTTY;
  const animate =
    stderrIsTTY === true &&
    !hasCi(env) &&
    !hasNoColor(env) &&
    !hasDisabledForceColor(env) &&
    !hasDumbTerminal(env);
  const colors =
    (!hasCi(env) || hasForceColor(env)) &&
    !hasNoColor(env) &&
    !hasDisabledForceColor(env) &&
    !hasDumbTerminal(env) &&
    (stdoutIsTTY === true || stderrIsTTY === true || hasForceColor(env));

  return {
    colors,
    animate,
    interactiveActivity: animate,
    quiet: environment?.quiet ?? false,
  };
};
