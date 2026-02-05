/**
 * Agent registry containing all known AI coding agents.
 *
 * Aggregates configs from individual agent folders. O(1) lookup by agent ID.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { config as adal } from "./adal/index.js";
import { config as amp } from "./amp/index.js";
import { config as antigravity } from "./antigravity/index.js";
import { config as augment } from "./augment/index.js";
import { config as claudeCode } from "./claude-code/index.js";
import { config as cline } from "./cline/index.js";
import { config as codebuddy } from "./codebuddy/index.js";
import { config as codex } from "./codex/index.js";
import { config as commandCode } from "./command-code/index.js";
import { config as continueAgent } from "./continue/index.js";
import { config as crush } from "./crush/index.js";
import { config as cursor } from "./cursor/index.js";
import { config as droid } from "./droid/index.js";
import { config as geminiCli } from "./gemini-cli/index.js";
import { config as githubCopilot } from "./github-copilot/index.js";
import { config as goose } from "./goose/index.js";
import { config as iflowCli } from "./iflow-cli/index.js";
import { config as junie } from "./junie/index.js";
import { config as kilo } from "./kilo/index.js";
import { config as kimiCli } from "./kimi-cli/index.js";
import { config as kiroCli } from "./kiro-cli/index.js";
import { config as kode } from "./kode/index.js";
import { config as mcpjam } from "./mcpjam/index.js";
import { config as mistralVibe } from "./mistral-vibe/index.js";
import { config as mux } from "./mux/index.js";
import { config as neovate } from "./neovate/index.js";
import { config as openclaw } from "./openclaw/index.js";
import { config as opencode } from "./opencode/index.js";
import { config as openhands } from "./openhands/index.js";
import { config as pi } from "./pi/index.js";
import { config as pochi } from "./pochi/index.js";
import { config as qoder } from "./qoder/index.js";
import { config as qwenCode } from "./qwen-code/index.js";
import { config as replit } from "./replit/index.js";
import { config as roo } from "./roo/index.js";
import { config as trae } from "./trae/index.js";
import { config as traeCn } from "./trae-cn/index.js";
import { config as windsurf } from "./windsurf/index.js";
import { config as zencoder } from "./zencoder/index.js";
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
  adal,
  amp,
  antigravity,
  augment,
  "claude-code": claudeCode,
  cline,
  codebuddy,
  codex,
  "command-code": commandCode,
  continue: continueAgent,
  crush,
  cursor,
  droid,
  "gemini-cli": geminiCli,
  "github-copilot": githubCopilot,
  goose,
  "iflow-cli": iflowCli,
  junie,
  kilo,
  "kimi-cli": kimiCli,
  "kiro-cli": kiroCli,
  kode,
  mcpjam,
  "mistral-vibe": mistralVibe,
  mux,
  neovate,
  openclaw,
  opencode,
  openhands,
  pi,
  pochi,
  qoder,
  "qwen-code": qwenCode,
  replit,
  roo,
  trae,
  "trae-cn": traeCn,
  windsurf,
  zencoder,
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
