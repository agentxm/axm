/** Published coding-agent identities, independent of capability data and adapters. */
import * as Schema from "effect/Schema";

/** @experimental This API is unstable and may change without notice. */
export const CONFIGURABLE_AGENT_IDS = [
  "adal",
  "aider-desk",
  "amp",
  "antigravity",
  "antigravity-cli",
  "augment",
  "claude-code",
  "cline",
  "codearts-agent",
  "codebuddy",
  "codemaker",
  "codestudio",
  "codex",
  "command-code",
  "continue",
  "cortex",
  "crush",
  "cursor",
  "deepagents",
  "devin",
  "dexto",
  "droid",
  "firebender",
  "forgecode",
  "gemini-cli",
  "github-copilot-cli",
  "goose",
  "grok-cli",
  "hermes",
  "ibm-bob",
  "iflow-cli",
  "junie",
  "lingma",
  "kilo",
  "kimi-cli",
  "kiro-cli",
  "kode",
  "mcpjam",
  "minimax-code",
  "mistral-vibe",
  "mux",
  "neovate",
  "openclaw",
  "opencode",
  "openhands",
  "ona",
  "pi",
  "pochi",
  "qoder",
  "qoder-cn",
  "qwen-code",
  "replit",
  "roo",
  "rovodev",
  "tabnine-cli",
  "trae-cn",
  "trae",
  "warp",
  "windsurf",
  "zencoder",
  "zed",
  "zenflow",
] as const;

/** @experimental This API is unstable and may change without notice. */
export type ConfigurableAgentId = (typeof CONFIGURABLE_AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const HOSTED_AGENT_IDS = ["chatgpt", "claude-ai", "cowork", "gemini-app"] as const;

/** @experimental This API is unstable and may change without notice. */
export type HostedAgentId = (typeof HOSTED_AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const AGENT_IDS = [...CONFIGURABLE_AGENT_IDS, ...HOSTED_AGENT_IDS] as const;

/** @experimental This API is unstable and may change without notice. */
export type AgentId = (typeof AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const AgentIdSchema = Schema.Literals(AGENT_IDS).annotate({
  identifier: "AgentId",
  title: "Agent ID",
  description: "Verified coding agent identifier in the capability catalog.",
  examples: ["claude-code", "codex", "cursor"],
});
