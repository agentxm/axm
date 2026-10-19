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
  type ActualSkills,
  type DeclaredSkill,
  type DeclaredSkills,
  type InstalledSkill,
  type ResolvedSkill,
  type ResolvedSkills,
  type SkillDetectionOrigin,
  type SkillExtensionsApi,
  type SkillExtensionsApiDeps,
  type SkillPackMember,
  type SkillScanners,
  type SkillScopedLoaders,
  type UnmanagedSkill,
} from "./skill.js";

// ---------------------------------------------------------------------------
// MCP server subject
// ---------------------------------------------------------------------------

export {
  makeMcpServerExtensionsApi,
  type ActualMcpServer,
  type ActualMcpServers,
  type DeclaredMcpServer,
  type DeclaredMcpServers,
  type InstalledMcpServer,
  type McpServerDetectionOrigin,
  type McpServerExtensionsApi,
  type McpServerExtensionsApiDeps,
  type McpServerPackMember,
  type McpServerScanners,
  type McpServerScopedLoaders,
  type ResolvedMcpServer,
  type ResolvedMcpServers,
  type UnmanagedMcpServer,
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

export {
  makeHookExtensionsApi,
  type ActualHook,
  type HookExtensionsApi,
  type InstalledHook,
} from "./hook.js";

// ---------------------------------------------------------------------------
// Knowledge subject
// ---------------------------------------------------------------------------

export {
  makeKnowledgeExtensionsApi,
  type ActualKnowledgeBundle,
  type InstalledKnowledgeBundle,
  type KnowledgeExtensionsApi,
} from "./knowledge.js";

// ---------------------------------------------------------------------------
// Rule subject
// ---------------------------------------------------------------------------

export {
  makeRuleExtensionsApi,
  type ActualRule,
  type InstalledRule,
  type RuleExtensionsApi,
} from "./rule.js";

// ---------------------------------------------------------------------------
// Pack subject
// ---------------------------------------------------------------------------

export {
  makePackExtensionsApi,
  type ActualPack,
  type ActualPacks,
  type DeclaredPack,
  type DeclaredPacks,
  type InstalledPack,
  type PackDetectionOrigin,
  type PackExtensionsApi,
  type PackExtensionsApiDeps,
  type PackPackMember,
  type PackScanners,
  type PackScopedLoaders,
  type ResolvedPack,
  type ResolvedPacks,
  type UnmanagedPack,
} from "./pack.js";

// ---------------------------------------------------------------------------
// Shared projection helper + name-index helpers
// ---------------------------------------------------------------------------

export {
  projectInstalledExtensions,
  projectPackMemberRows,
  type BuildInstalledRowInput,
  type PackMemberBinding,
  type ProjectInstalledExtensionsOutput,
  type SubjectPolicy,
  type SubjectProjectionInput,
  type TActualEntry,
  type TDeclaredEntry,
  type TResolvedEntry,
} from "./projection.js";

export { findByName, indexByName, type RowWithKey } from "./indexByName.js";

export {
  ExtensionInventoryClassificationSchema,
  ExtensionInventoryLifecycleSchema,
  ExtensionInventoryRowSchema,
  ExtensionInventorySchema,
  projectExtensionInventory,
  type ExtensionInventory,
  type ExtensionInventoryClassification,
  type ExtensionInventoryLifecycle,
  type ExtensionInventoryRow,
} from "./inventory.js";
