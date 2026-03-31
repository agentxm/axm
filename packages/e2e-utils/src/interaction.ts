export interface InteractionEnvOptions {
  isTTY: boolean | undefined;
  env: NodeJS.ProcessEnv;
}

export const isCI = (env: NodeJS.ProcessEnv) => !!env["CI"];

// TODO: Source these from the axm.sh SDK agents module metadata instead of
// maintaining a hardcoded list here.
const AGENT_ENV_KEYS = [
  "CLAUDECODE", // Claude Code (Anthropic)
  "GEMINI_CLI", // Gemini CLI (Google)
  "CURSOR_AGENT", // Cursor IDE agent mode
] as const;

export const isAgent = (env: NodeJS.ProcessEnv) => AGENT_ENV_KEYS.some((key) => !!env[key]);

export const isInteractive = ({ isTTY, env }: InteractionEnvOptions) =>
  isTTY === true && !isCI(env);

export const isHumanInteractive = ({ isTTY, env }: InteractionEnvOptions) =>
  isInteractive({ isTTY, env }) && !isAgent(env);
