/**
 * Agent registry containing all known AI coding agents.
 *
 * Aggregates descriptors from individual agent folders. O(1) lookup by agent ID.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { descriptor as adal } from "./adal/index.js";
import { descriptor as amp } from "./amp/index.js";
import { descriptor as antigravity } from "./antigravity/index.js";
import { descriptor as augment } from "./augment/index.js";
import { descriptor as claudeCode } from "./claude-code/index.js";
import { descriptor as cline } from "./cline/index.js";
import { descriptor as codebuddy } from "./codebuddy/index.js";
import { descriptor as codex } from "./codex/index.js";
import { descriptor as commandCode } from "./command-code/index.js";
import { descriptor as continueAgent } from "./continue/index.js";
import { descriptor as crush } from "./crush/index.js";
import { descriptor as cursor } from "./cursor/index.js";
import { descriptor as droid } from "./droid/index.js";
import { descriptor as geminiCli } from "./gemini-cli/index.js";
import { descriptor as githubCopilot } from "./github-copilot/index.js";
import { descriptor as goose } from "./goose/index.js";
import { descriptor as iflowCli } from "./iflow-cli/index.js";
import { descriptor as junie } from "./junie/index.js";
import { descriptor as kilo } from "./kilo/index.js";
import { descriptor as kimiCli } from "./kimi-cli/index.js";
import { descriptor as kiroCli } from "./kiro-cli/index.js";
import { descriptor as kode } from "./kode/index.js";
import { descriptor as mcpjam } from "./mcpjam/index.js";
import { descriptor as mistralVibe } from "./mistral-vibe/index.js";
import { descriptor as mux } from "./mux/index.js";
import { descriptor as neovate } from "./neovate/index.js";
import { descriptor as openclaw } from "./openclaw/index.js";
import { descriptor as opencode } from "./opencode/index.js";
import { descriptor as openhands } from "./openhands/index.js";
import { descriptor as pi } from "./pi/index.js";
import { descriptor as pochi } from "./pochi/index.js";
import { descriptor as qoder } from "./qoder/index.js";
import { descriptor as qwenCode } from "./qwen-code/index.js";
import { descriptor as replit } from "./replit/index.js";
import { descriptor as roo } from "./roo/index.js";
import { descriptor as trae } from "./trae/index.js";
import { descriptor as traeCn } from "./trae-cn/index.js";
import { descriptor as windsurf } from "./windsurf/index.js";
import { descriptor as zencoder } from "./zencoder/index.js";
import type { AgentDescriptor, AgentId, AgentRegistry } from "./types.js";

/**
 * Complete registry of all known AI coding agents.
 *
 * Keys are agent IDs, values are full descriptor objects.
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
 * Returns `Option.some(descriptor)` if the agent exists, `Option.none()` otherwise.
 * O(1) lookup time.
 *
 * @param id - The agent identifier to look up
 * @returns Option containing the agent descriptor if found
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
export const getAgentById = (id: string): Option.Option<AgentDescriptor> =>
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
export const getAgentIds = (): ReadonlyArray<AgentId> =>
  Object.keys(AGENTS) as ReadonlyArray<AgentId>;

/**
 * Get all registered agent descriptors.
 *
 * Useful for iteration when you need full descriptor objects.
 *
 * @returns Array of all agent descriptors
 *
 * @example
 * ```typescript
 * const agents = getAllAgents();
 * for (const agent of agents) {
 *   console.log(`${agent.name}: ${agent.skills.dir}`);
 * }
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getAllAgents = (): ReadonlyArray<AgentDescriptor> => Object.values(AGENTS);
