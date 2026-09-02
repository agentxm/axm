/**
 * Executable `workspace/*` rule catalog.
 *
 * Rules are ordered for deterministic reporting and partitioned positively by
 * the evidence available in repository and live-workspace views. Identity,
 * default severity, and view membership are specified in the static catalog
 * metadata and checked against these executable values.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { LintRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import type { WorkspaceRuleContext } from "../workspace-context.js";
import { initializedRule } from "./workspace/initialized.js";
import { settingsSchemaValidRule } from "./workspace/settings-schema-valid.js";
import { settingsKeysRecognizedRule } from "./workspace/settings-keys-recognized.js";
import { lockfileValidRule } from "./workspace/lockfile-valid.js";
import { agentsRecognizedRule } from "./workspace/agents-recognized.js";
import { agentsDetectedDeclaredRule } from "./workspace/agents-detected-declared.js";
import { instructionsSourcePresentRule } from "./workspace/instructions-source-present.js";
import { instructionsTargetCurrentRule } from "./workspace/instructions-target-current.js";
import { instructionsTargetUnownedRule } from "./workspace/instructions-target-unowned.js";
import { instructionsTargetStaleRule } from "./workspace/instructions-target-stale.js";
import { projectionsCurrentRule } from "./workspace/projections-current.js";
import { instructionsAgentSupportedRule } from "./workspace/instructions-agent-supported.js";
import { instructionsGitignoreCurrentRule } from "./workspace/instructions-gitignore-current.js";
import { skillsDeclarationsValidRule } from "./workspace/skills-declarations-valid.js";
import { skillsLockfileAlignedRule } from "./workspace/skills-lockfile-aligned.js";
import { skillsIntegrityValidRule } from "./workspace/skills-integrity-valid.js";
import { skillsArtifactsCorrectRule } from "./workspace/skills-artifacts-correct.js";
import { packsDeclarationsValidRule } from "./workspace/packs-declarations-valid.js";
import { packsDependenciesResolvedRule } from "./workspace/packs-dependencies-resolved.js";
import { configuredButNotInstalledRule } from "./workspace/configured-but-not-installed.js";
import { mcpServerNoSecretLiteralRule } from "./workspace/mcps-no-secret-literal.js";
import { mcpServerTransportExclusivityRule } from "./workspace/mcps-transport-exclusivity.js";
import { mcpServerAgentDriftRule } from "./workspace/mcps-agent-drift.js";
import { mcpServerSharedTargetCompatibleRule } from "./workspace/mcps-shared-target-compatible.js";
import { mcpServerAgentOrphanedRule } from "./workspace/mcps-agent-orphaned.js";
import { desiredStateReconcilableRule } from "./workspace/desired-state-reconcilable.js";
import { knowledgeStateValidRule } from "./workspace/knowledge-state-valid.js";
import { axmSkillCompatibleRule } from "./workspace/axm-skill-compatible.js";
import { hookOwnershipAmbiguousRule } from "./workspace/hook-ownership-ambiguous.js";
import { managedFileUnownedRule } from "./workspace/managed-file-unowned.js";
import { sourceEndpointsAlignedRule } from "./workspace/source-endpoints-aligned.js";

/**
 * Ordered repository-safe `workspace/*` rule catalog. Declaration order is
 * the evaluation order within a single `evaluateContexts` call. It groups
 * foundation rules first, then install-family rules by invariant.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const repositoryWorkspaceRules: ReadonlyArray<LintRule<WorkspaceRuleContext>> = [
  // Foundation (classification-independent workspace well-formedness).
  initializedRule,
  settingsSchemaValidRule,
  settingsKeysRecognizedRule,
  lockfileValidRule,
  sourceEndpointsAlignedRule,
  desiredStateReconcilableRule,
  axmSkillCompatibleRule,
  agentsRecognizedRule,
  instructionsSourcePresentRule,
  instructionsAgentSupportedRule,
  instructionsGitignoreCurrentRule,
  // Declaration valid (configured).
  skillsDeclarationsValidRule,
  packsDeclarationsValidRule,
  configuredButNotInstalledRule,
  knowledgeStateValidRule,
  mcpServerTransportExclusivityRule,
  mcpServerNoSecretLiteralRule,
  mcpServerSharedTargetCompatibleRule,
  // Lockfile aligned (configured).
  skillsLockfileAlignedRule,
  // Integrity intact (configured + implicit).
  skillsIntegrityValidRule,
  // Artifacts correct (configured + implicit).
  // Managed — unmanaged class must be empty.
  // Pack dependencies resolved (configured packs).
  packsDependenciesResolvedRule,
];

/** Rules whose evidence exists only in the live managed workspace. */
export const liveOnlyWorkspaceRules: ReadonlyArray<LintRule<WorkspaceRuleContext>> = [
  agentsDetectedDeclaredRule,
  instructionsTargetCurrentRule,
  instructionsTargetUnownedRule,
  instructionsTargetStaleRule,
  projectionsCurrentRule,
  hookOwnershipAmbiguousRule,
  managedFileUnownedRule,
  mcpServerAgentDriftRule,
  mcpServerAgentOrphanedRule,
  skillsArtifactsCorrectRule,
];

/** Complete workspace-view catalog, retained as the public catalog surface. */
export const workspaceRules: ReadonlyArray<LintRule<WorkspaceRuleContext>> = [
  initializedRule,
  settingsSchemaValidRule,
  settingsKeysRecognizedRule,
  lockfileValidRule,
  sourceEndpointsAlignedRule,
  desiredStateReconcilableRule,
  axmSkillCompatibleRule,
  agentsRecognizedRule,
  agentsDetectedDeclaredRule,
  instructionsSourcePresentRule,
  instructionsTargetCurrentRule,
  instructionsTargetUnownedRule,
  instructionsTargetStaleRule,
  instructionsAgentSupportedRule,
  instructionsGitignoreCurrentRule,
  projectionsCurrentRule,
  hookOwnershipAmbiguousRule,
  managedFileUnownedRule,
  skillsDeclarationsValidRule,
  packsDeclarationsValidRule,
  configuredButNotInstalledRule,
  knowledgeStateValidRule,
  mcpServerTransportExclusivityRule,
  mcpServerNoSecretLiteralRule,
  mcpServerSharedTargetCompatibleRule,
  mcpServerAgentDriftRule,
  mcpServerAgentOrphanedRule,
  skillsLockfileAlignedRule,
  skillsIntegrityValidRule,
  skillsArtifactsCorrectRule,
  packsDependenciesResolvedRule,
];
