/**
 * Subject-module barrel: re-exports every per-subject API factory and its
 * public payload types from one entry point so `context.ts` and downstream
 * consumers can import a single module per concern instead of seven.
 *
 * Skill, MCP server and Pack subjects own their row shapes and projection
 * wiring; rule, hook, knowledge and subagent subjects instantiate the shared
 * canonical subject. This barrel only re-exports — no logic.
 */

// ---------------------------------------------------------------------------
// Skill subject
// ---------------------------------------------------------------------------

export {
  makeSkillExtensionsApi,
  type ActualSkill,
  type InstalledSkill,
  type SkillExtensionsApi,
} from "./skill.js";

// ---------------------------------------------------------------------------
// MCP server subject
// ---------------------------------------------------------------------------

export {
  makeMcpServerExtensionsApi,
  type ActualMcpServer,
  type InstalledMcpServer,
  type McpServerExtensionsApi,
} from "./mcp-server.js";

// ---------------------------------------------------------------------------
// Subagent subject
// ---------------------------------------------------------------------------

export {
  makeSubagentExtensionsApi,
  type ActualSubagent,
  type InstalledSubagent,
  type SubagentExtensionsApi,
} from "./subagent.js";

// ---------------------------------------------------------------------------
// Hook subject
// ---------------------------------------------------------------------------

export { makeHookExtensionsApi, type HookExtensionsApi, type InstalledHook } from "./hook.js";

// ---------------------------------------------------------------------------
// Knowledge subject
// ---------------------------------------------------------------------------

export {
  makeKnowledgeExtensionsApi,
  type InstalledKnowledgeBundle,
  type KnowledgeExtensionsApi,
} from "./knowledge.js";

// ---------------------------------------------------------------------------
// Rule subject
// ---------------------------------------------------------------------------

export { makeRuleExtensionsApi, type InstalledRule, type RuleExtensionsApi } from "./rule.js";

// ---------------------------------------------------------------------------
// Pack subject
// ---------------------------------------------------------------------------

export {
  makePackExtensionsApi,
  type ActualPack,
  type InstalledPack,
  type PackExtensionsApi,
} from "./pack.js";

// ---------------------------------------------------------------------------
// Shared projection helper + name-index helpers
// ---------------------------------------------------------------------------

export { type PackMemberBinding } from "./projection.js";
