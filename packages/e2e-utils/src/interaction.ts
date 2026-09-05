const hasEnv = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = env[name];
  return value !== undefined && value !== "";
};

const hasAnyEnv = (env: NodeJS.ProcessEnv, names: ReadonlyArray<string>): boolean =>
  names.some((name) => hasEnv(env, name));

export interface InteractionEnvOptions {
  readonly isTTY: boolean | undefined;
  readonly env: NodeJS.ProcessEnv;
}

const AGENT_ENV_KEYS = [
  "CLAUDECODE",
  "GEMINI_CLI",
  "CURSOR_AGENT",
] as const satisfies ReadonlyArray<string>;

export const isCI = (env: NodeJS.ProcessEnv): boolean => hasEnv(env, "CI");

export const isAgent = (env: NodeJS.ProcessEnv): boolean => hasAnyEnv(env, AGENT_ENV_KEYS);

export const isInteractive = ({ isTTY, env }: InteractionEnvOptions): boolean =>
  isTTY === true && !isCI(env);

export const isHumanInteractive = ({ isTTY, env }: InteractionEnvOptions): boolean =>
  isInteractive({ isTTY, env }) && !isAgent(env);
