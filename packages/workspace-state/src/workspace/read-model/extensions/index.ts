/**
 * Subject-module barrel: re-exports every per-subject API factory and its
 * public payload types from one entry point so `context.ts` and downstream
 * consumers can import a single module per concern instead of seven.
 *
 * Each subject module owns its own row shapes, scanner-composition signature,
 * and projection wiring; this barrel only re-exports — no logic.
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
  type InstalledPackForSkills,
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
  type InstalledPackForMcpServers,
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
  type ActualSubagents,
  type DeclaredSubagent,
  type DeclaredSubagents,
  type InstalledPackForSubagents,
  type InstalledSubagent,
  type ResolvedSubagent,
  type ResolvedSubagents,
  type SubagentDetectionOrigin,
  type SubagentExtensionsApi,
  type SubagentExtensionsApiDeps,
  type SubagentPackMember,
  type SubagentScanners,
  type SubagentScopedLoaders,
  type UnmanagedSubagent,
} from "./subagent.js";

// ---------------------------------------------------------------------------
// Hook subject
// ---------------------------------------------------------------------------

export {
  makeHookExtensionsApi,
  type ActualHook,
  type ActualHooks,
  type DeclaredHook,
  type DeclaredHooks,
  type HookDetectionOrigin,
  type HookExtensionsApi,
  type HookExtensionsApiDeps,
  type HookPackMember,
  type HookScanners,
  type HookScopedLoaders,
  type InstalledHook,
  type InstalledPackForHooks,
  type ResolvedHook,
  type ResolvedHooks,
  type UnmanagedHook,
} from "./hook.js";

// ---------------------------------------------------------------------------
// Knowledge subject
// ---------------------------------------------------------------------------

export {
  makeKnowledgeExtensionsApi,
  type ActualKnowledge,
  type ActualKnowledgeBundle,
  type DeclaredKnowledge,
  type DeclaredKnowledgeBundle,
  type InstalledKnowledgeBundle,
  type InstalledPackForKnowledge,
  type KnowledgeDetectionOrigin,
  type KnowledgeExtensionsApi,
  type KnowledgeExtensionsApiDeps,
  type KnowledgePackMember,
  type KnowledgeScanners,
  type KnowledgeScopedLoaders,
  type ResolvedKnowledge,
  type ResolvedKnowledgeBundle,
  type UnmanagedKnowledgeBundle,
} from "./knowledge.js";

// ---------------------------------------------------------------------------
// Rule subject
// ---------------------------------------------------------------------------

export {
  makeRuleExtensionsApi,
  type ActualRule,
  type ActualRules,
  type DeclaredRule,
  type DeclaredRules,
  type InstalledPackForRules,
  type InstalledRule,
  type ResolvedRule,
  type ResolvedRules,
  type RuleDetectionOrigin,
  type RuleExtensionsApi,
  type RuleExtensionsApiDeps,
  type RulePackMember,
  type RuleScanners,
  type RuleScopedLoaders,
  type UnmanagedRule,
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
  type BuildInstalledRowInput,
  type ProjectInstalledExtensionsInput,
  type ProjectInstalledExtensionsOutput,
  type SubjectPolicy,
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
  type ExtensionInventoryObservation,
  type ExtensionInventoryRow,
  type LifecycleInventoryCandidate,
  type ProjectExtensionInventoryInput,
} from "./inventory.js";
