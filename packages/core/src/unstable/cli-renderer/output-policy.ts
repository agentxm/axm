export interface CliOutputEnvironment {
  readonly stdoutIsTTY: boolean | undefined;
  readonly env: NodeJS.ProcessEnv;
}

export interface CliOutputPolicy {
  readonly colors: boolean;
  readonly interactiveActivity: boolean;
}

const hasNonEmptyEnv = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = env[name];
  return value !== undefined && value !== "";
};

const hasCi = (env: NodeJS.ProcessEnv): boolean => hasNonEmptyEnv(env, "CI");

const hasNoColor = (env: NodeJS.ProcessEnv): boolean => hasNonEmptyEnv(env, "NO_COLOR");

const hasDisabledForceColor = (env: NodeJS.ProcessEnv): boolean => {
  const value = env["FORCE_COLOR"];
  return value !== undefined && (value === "" || value === "0");
};

export const resolveCliOutputPolicy = (environment?: CliOutputEnvironment): CliOutputPolicy => {
  // eslint-disable-next-line no-restricted-properties -- Centralized env access for CLI output policy detection.
  const env = environment?.env ?? process.env;
  const stdoutIsTTY = environment?.stdoutIsTTY ?? process.stdout.isTTY;
  const plainOutput =
    stdoutIsTTY !== true || hasCi(env) || hasNoColor(env) || hasDisabledForceColor(env);

  return {
    colors: !plainOutput,
    interactiveActivity: !plainOutput,
  };
};
