/**
 * Agent registry containing all known AI coding agents.
 *
 * Pure data registry with O(1) lookup by agent ID. Sourced from
 * vercel-labs/skills reference implementation.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { claudeHome, codexHome, configHome, home } from "./constants.js";
import type { AgentConfig, AgentId, AgentRegistry } from "./types.js";

/**
 * Complete registry of all known AI coding agents.
 *
 * Keys are agent IDs, values are full configuration objects.
 * Paths are pre-expanded at module initialization.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AGENTS: AgentRegistry = {
  adal: {
    id: "adal",
    name: "AdaL",
    skills: {
      projectDir: ".adal/skills",
      globalDir: Option.some(path.join(home, ".adal/skills")),
    },
  },
  amp: {
    id: "amp",
    name: "Amp",
    skills: {
      projectDir: ".agents/skills",
      globalDir: Option.some(path.join(configHome, "agents/skills")),
    },
  },
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    skills: {
      projectDir: ".agent/skills",
      globalDir: Option.some(path.join(home, ".gemini/antigravity/skills")),
    },
  },
  augment: {
    id: "augment",
    name: "Augment",
    skills: {
      projectDir: ".augment/rules",
      globalDir: Option.some(path.join(home, ".augment/rules")),
    },
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    skills: {
      projectDir: ".claude/skills",
      globalDir: Option.some(path.join(claudeHome, "skills")),
    },
  },
  cline: {
    id: "cline",
    name: "Cline",
    skills: {
      projectDir: ".cline/skills",
      globalDir: Option.some(path.join(home, ".cline/skills")),
    },
  },
  codebuddy: {
    id: "codebuddy",
    name: "CodeBuddy",
    skills: {
      projectDir: ".codebuddy/skills",
      globalDir: Option.some(path.join(home, ".codebuddy/skills")),
    },
  },
  codex: {
    id: "codex",
    name: "Codex",
    skills: {
      projectDir: ".codex/skills",
      globalDir: Option.some(path.join(codexHome, "skills")),
    },
  },
  "command-code": {
    id: "command-code",
    name: "Command Code",
    skills: {
      projectDir: ".commandcode/skills",
      globalDir: Option.some(path.join(home, ".commandcode/skills")),
    },
  },
  continue: {
    id: "continue",
    name: "Continue",
    skills: {
      projectDir: ".continue/skills",
      globalDir: Option.some(path.join(home, ".continue/skills")),
    },
  },
  crush: {
    id: "crush",
    name: "Crush",
    skills: {
      projectDir: ".crush/skills",
      globalDir: Option.some(path.join(home, ".config/crush/skills")),
    },
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    skills: {
      projectDir: ".cursor/skills",
      globalDir: Option.some(path.join(home, ".cursor/skills")),
    },
  },
  droid: {
    id: "droid",
    name: "Droid",
    skills: {
      projectDir: ".factory/skills",
      globalDir: Option.some(path.join(home, ".factory/skills")),
    },
  },
  "gemini-cli": {
    id: "gemini-cli",
    name: "Gemini CLI",
    skills: {
      projectDir: ".gemini/skills",
      globalDir: Option.some(path.join(home, ".gemini/skills")),
    },
  },
  "github-copilot": {
    id: "github-copilot",
    name: "GitHub Copilot",
    skills: {
      projectDir: ".github/skills",
      globalDir: Option.some(path.join(home, ".copilot/skills")),
    },
  },
  goose: {
    id: "goose",
    name: "Goose",
    skills: {
      projectDir: ".goose/skills",
      globalDir: Option.some(path.join(configHome, "goose/skills")),
    },
  },
  "iflow-cli": {
    id: "iflow-cli",
    name: "iFlow CLI",
    skills: {
      projectDir: ".iflow/skills",
      globalDir: Option.some(path.join(home, ".iflow/skills")),
    },
  },
  junie: {
    id: "junie",
    name: "Junie",
    skills: {
      projectDir: ".junie/skills",
      globalDir: Option.some(path.join(home, ".junie/skills")),
    },
  },
  kilo: {
    id: "kilo",
    name: "Kilo Code",
    skills: {
      projectDir: ".kilocode/skills",
      globalDir: Option.some(path.join(home, ".kilocode/skills")),
    },
  },
  "kimi-cli": {
    id: "kimi-cli",
    name: "Kimi Code CLI",
    skills: {
      projectDir: ".agents/skills",
      globalDir: Option.some(path.join(home, ".config/agents/skills")),
    },
  },
  "kiro-cli": {
    id: "kiro-cli",
    name: "Kiro CLI",
    skills: {
      projectDir: ".kiro/skills",
      globalDir: Option.some(path.join(home, ".kiro/skills")),
    },
  },
  kode: {
    id: "kode",
    name: "Kode",
    skills: {
      projectDir: ".kode/skills",
      globalDir: Option.some(path.join(home, ".kode/skills")),
    },
  },
  mcpjam: {
    id: "mcpjam",
    name: "MCPJam",
    skills: {
      projectDir: ".mcpjam/skills",
      globalDir: Option.some(path.join(home, ".mcpjam/skills")),
    },
  },
  "mistral-vibe": {
    id: "mistral-vibe",
    name: "Mistral Vibe",
    skills: {
      projectDir: ".vibe/skills",
      globalDir: Option.some(path.join(home, ".vibe/skills")),
    },
  },
  mux: {
    id: "mux",
    name: "Mux",
    skills: {
      projectDir: ".mux/skills",
      globalDir: Option.some(path.join(home, ".mux/skills")),
    },
  },
  neovate: {
    id: "neovate",
    name: "Neovate",
    skills: {
      projectDir: ".neovate/skills",
      globalDir: Option.some(path.join(home, ".neovate/skills")),
    },
  },
  openclaw: {
    id: "openclaw",
    name: "OpenClaw",
    skills: {
      projectDir: "skills",
      globalDir: Option.some(path.join(home, ".openclaw/skills")),
    },
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    skills: {
      projectDir: ".opencode/skills",
      globalDir: Option.some(path.join(configHome, "opencode/skills")),
    },
  },
  openhands: {
    id: "openhands",
    name: "OpenHands",
    skills: {
      projectDir: ".openhands/skills",
      globalDir: Option.some(path.join(home, ".openhands/skills")),
    },
  },
  pi: {
    id: "pi",
    name: "Pi",
    skills: {
      projectDir: ".pi/skills",
      globalDir: Option.some(path.join(home, ".pi/agent/skills")),
    },
  },
  pochi: {
    id: "pochi",
    name: "Pochi",
    skills: {
      projectDir: ".pochi/skills",
      globalDir: Option.some(path.join(home, ".pochi/skills")),
    },
  },
  qoder: {
    id: "qoder",
    name: "Qoder",
    skills: {
      projectDir: ".qoder/skills",
      globalDir: Option.some(path.join(home, ".qoder/skills")),
    },
  },
  "qwen-code": {
    id: "qwen-code",
    name: "Qwen Code",
    skills: {
      projectDir: ".qwen/skills",
      globalDir: Option.some(path.join(home, ".qwen/skills")),
    },
  },
  replit: {
    id: "replit",
    name: "Replit",
    skills: {
      projectDir: ".agents/skills",
      globalDir: Option.none(),
    },
  },
  roo: {
    id: "roo",
    name: "Roo Code",
    skills: {
      projectDir: ".roo/skills",
      globalDir: Option.some(path.join(home, ".roo/skills")),
    },
  },
  trae: {
    id: "trae",
    name: "Trae",
    skills: {
      projectDir: ".trae/skills",
      globalDir: Option.some(path.join(home, ".trae/skills")),
    },
  },
  "trae-cn": {
    id: "trae-cn",
    name: "Trae CN",
    skills: {
      projectDir: ".trae/skills",
      globalDir: Option.some(path.join(home, ".trae-cn/skills")),
    },
  },
  windsurf: {
    id: "windsurf",
    name: "Windsurf",
    skills: {
      projectDir: ".windsurf/skills",
      globalDir: Option.some(path.join(home, ".codeium/windsurf/skills")),
    },
  },
  zencoder: {
    id: "zencoder",
    name: "Zencoder",
    skills: {
      projectDir: ".zencoder/skills",
      globalDir: Option.some(path.join(home, ".zencoder/skills")),
    },
  },
};

/**
 * Look up an agent by ID.
 *
 * Returns `Option.some(config)` if the agent exists, `Option.none()` otherwise.
 * O(1) lookup time.
 *
 * @param id - The agent identifier to look up
 * @returns Option containing the agent config if found
 *
 * @example
 * ```typescript
 * const agent = getAgentById("claude-code");
 * if (Option.isSome(agent)) {
 *   console.log(agent.value.name); // "Claude Code"
 * }
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getAgentById = (id: string): Option.Option<AgentConfig> =>
  Option.fromNullable(AGENTS[id as AgentId]);

/**
 * Get all registered agent IDs.
 *
 * @returns Array of all agent identifiers
 *
 * @example
 * ```typescript
 * const ids = getAgentIds();
 * // ["adal", "amp", "antigravity", "augment", "claude-code", ...]
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getAgentIds = (): AgentId[] => Object.keys(AGENTS) as AgentId[];

/**
 * Get all registered agent configurations.
 *
 * Useful for iteration when you need full config objects.
 *
 * @returns Array of all agent configurations
 *
 * @example
 * ```typescript
 * const agents = getAllAgents();
 * for (const agent of agents) {
 *   console.log(`${agent.name}: ${agent.skills.projectDir}`);
 * }
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getAllAgents = (): AgentConfig[] => Object.values(AGENTS);
