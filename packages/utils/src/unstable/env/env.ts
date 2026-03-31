export const readEnv = (env: NodeJS.ProcessEnv, name: string): string | undefined => env[name];

export const readEnvWithDefault = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string => readEnv(env, name) ?? fallback;

export const hasEnv = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = readEnv(env, name);
  return value !== undefined && value !== "";
};

export const hasAnyEnv = (env: NodeJS.ProcessEnv, names: ReadonlyArray<string>): boolean =>
  names.some((name) => hasEnv(env, name));
