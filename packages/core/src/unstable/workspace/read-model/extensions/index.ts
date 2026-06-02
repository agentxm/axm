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
  type IgnoredSkillCandidate,
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
// Command subject
// ---------------------------------------------------------------------------

export {
  makeCommandExtensionsApi,
  type ActualCommand,
  type ActualCommands,
  type CommandDetectionOrigin,
  type CommandExtensionsApi,
  type CommandExtensionsApiDeps,
  type CommandPackMember,
  type CommandScanners,
  type CommandScopedLoaders,
  type DeclaredCommand,
  type DeclaredCommands,
  type IgnoredCommandCandidate,
  type InstalledCommand,
  type InstalledPackForCommands,
  type ResolvedCommand,
  type ResolvedCommands,
  type UnmanagedCommand,
} from "./command.js";

// ---------------------------------------------------------------------------
// MCP server subject
// ---------------------------------------------------------------------------

export {
  makeMcpServerExtensionsApi,
  type ActualMcpServer,
  type ActualMcpServers,
  type DeclaredMcpServer,
  type DeclaredMcpServers,
  type IgnoredMcpServerCandidate,
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
  type IgnoredSubagentCandidate,
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
// context subject
// ---------------------------------------------------------------------------

export {
  makeDocsExtensionsApi,
  type ActualDocsPackage,
  type ActualDocs,
  type DeclaredDocsPackage,
  type DeclaredDocs,
  type DocsDetectionOrigin,
  type DocsExtensionsApi,
  type DocsExtensionsApiDeps,
  type DocsPackMember,
  type DocsScanners,
  type IgnoredDocsCandidate,
  type InstalledDocsPackage,
  type InstalledPackForDocs,
  type ResolvedDocsPackage,
  type ResolvedDocs,
  type UnmanagedDocsPackage,
} from "./docs.js";

// ---------------------------------------------------------------------------
// Rule subject
// ---------------------------------------------------------------------------

export {
  makeRuleExtensionsApi,
  type ActualRule,
  type ActualRules,
  type DeclaredRule,
  type DeclaredRules,
  type IgnoredRuleCandidate,
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
  type IgnoredPackCandidate,
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
  type BuildActualIgnoredRowInput,
  type BuildDeclaredIgnoredRowInput,
  type BuildInstalledRowInput,
  type BuildPackMemberIgnoredRowInput,
  type ProjectInstalledExtensionsInput,
  type ProjectInstalledExtensionsOutput,
  type SubjectPolicy,
  type TActualEntry,
  type TDeclaredEntry,
  type TResolvedEntry,
} from "./projection.js";

export { findByName, indexByName, type RowWithKey } from "./indexByName.js";
