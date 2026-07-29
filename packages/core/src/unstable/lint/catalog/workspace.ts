/**
 * `workspace/*` rule catalog — the v1 rule set.
 *
 * Per `agentxm-internal/docs/design/lint-engine.md §10.workspace`, `axm lint` (locally only —
 * never publish) runs exactly these rules against each workspace read model.
 * Rules are grouped by classification invariant — foundation first, then
 * one group per invariant that install-family rules enforce:
 *
 * | ID                                      | Severity | Autofix     |
 * | --------------------------------------- | -------- | ----------- |
 * | `workspace/initialized`                 | error    | —           |
 * | `workspace/settings-schema-valid`       | error    | —           |
 | `workspace/settings-keys-recognized`    | error    | —           |
 * | `workspace/lockfile-valid`              | error    | autofixing  |
 * | `workspace/agents-recognized`           | error    | —           |
 * | `workspace/agents-detected-declared`    | warning  | —           |
 * | `workspace/skills-declarations-valid`   | error    | —           |
 * | `workspace/packs-declarations-valid`    | error    | —           |
 * | `workspace/skills-lockfile-aligned`     | error    | autofixing  |
 * | `workspace/skills-integrity-valid`      | error    | autofixing  |
 * | `workspace/skills-artifacts-correct`    | error    | autofixing  |
 * | `workspace/skills-managed`              | error    | —           |
 * | `workspace/packs-dependencies-resolved` | error    | —           |
 * | `workspace/packs-members-retained`      | warning  | —           |
 * | `workspace/recommended-packs-retained`  | warning  | —           |
 *
 * Autofix rides per-extension Operations only (§6). No `editFile`,
 * `writeFile`, or `syncWorkspace()` reference — arms whose remediation can't
 * be expressed in the operation vocabulary ship as `AdvisoryFinding` with a
 * CLI suggestion instead.
 *
 * Rule ids are **registered with the lint config allowlist at module-load
 * time**, so importing this catalog extends the set of accepted
 * `.axm/settings.json` `lint.rules` keys.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { registerLintRuleIds } from "../config.js";
import type { LintRule } from "../rule.js";
import type { WorkspaceRuleContext } from "../context.js";
import { initializedRule } from "./workspace/initialized.js";
import { settingsSchemaValidRule } from "./workspace/settings-schema-valid.js";
import { settingsKeysRecognizedRule } from "./workspace/settings-keys-recognized.js";
import { lockfileValidRule } from "./workspace/lockfile-valid.js";
import { agentsRecognizedRule } from "./workspace/agents-recognized.js";
import { agentsDetectedDeclaredRule } from "./workspace/agents-detected-declared.js";
import { instructionsSourcePresentRule } from "./workspace/instructions-source-present.js";
import { instructionsTargetCurrentRule } from "./workspace/instructions-target-current.js";
import { instructionsAgentSupportedRule } from "./workspace/instructions-agent-supported.js";
import { instructionsGitignoreCurrentRule } from "./workspace/instructions-gitignore-current.js";
import { skillsDeclarationsValidRule } from "./workspace/skills-declarations-valid.js";
import { skillsLockfileAlignedRule } from "./workspace/skills-lockfile-aligned.js";
import { skillsIntegrityValidRule } from "./workspace/skills-integrity-valid.js";
import { skillsArtifactsCorrectRule } from "./workspace/skills-artifacts-correct.js";
import { skillsManagedRule } from "./workspace/skills-managed.js";
import { packsDeclarationsValidRule } from "./workspace/packs-declarations-valid.js";
import { packsDependenciesResolvedRule } from "./workspace/packs-dependencies-resolved.js";
import { packsMembersRetainedRule } from "./workspace/packs-members-retained.js";
import { recommendedPacksRetainedRule } from "./workspace/recommended-packs-retained.js";
import { configuredButNotInstalledRule } from "./workspace/configured-but-not-installed.js";
import { mcpServerNoSecretLiteralRule } from "./workspace/mcps-no-secret-literal.js";
import { mcpServerTransportExclusivityRule } from "./workspace/mcps-transport-exclusivity.js";
import { mcpServerAgentDriftRule } from "./workspace/mcps-agent-drift.js";
import { mcpServerAgentOrphanedRule } from "./workspace/mcps-agent-orphaned.js";

/**
 * Ordered v1 `workspace/*` rule catalog. Declaration order is the evaluation
 * order within a single `evaluateContexts` call (deterministic ordering is
 * test-observable; see `evaluate.ts`). The catalog groups foundation rules
 * first, then install-family rules by classification invariant: declaration
 * validity, lockfile alignment, integrity, artifact correctness, the
 * unmanaged-class-empty check, pack dependency resolution, and implicit
 * retention.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const workspaceRules: ReadonlyArray<LintRule<WorkspaceRuleContext>> = [
  // Foundation (classification-independent workspace well-formedness).
  initializedRule,
  settingsSchemaValidRule,
  settingsKeysRecognizedRule,
  lockfileValidRule,
  agentsRecognizedRule,
  agentsDetectedDeclaredRule,
  instructionsSourcePresentRule,
  instructionsTargetCurrentRule,
  instructionsAgentSupportedRule,
  instructionsGitignoreCurrentRule,
  // Declaration valid (configured).
  skillsDeclarationsValidRule,
  packsDeclarationsValidRule,
  configuredButNotInstalledRule,
  mcpServerTransportExclusivityRule,
  mcpServerNoSecretLiteralRule,
  mcpServerAgentDriftRule,
  mcpServerAgentOrphanedRule,
  // Lockfile aligned (configured).
  skillsLockfileAlignedRule,
  // Integrity intact (configured + implicit).
  skillsIntegrityValidRule,
  // Artifacts correct (configured + implicit).
  skillsArtifactsCorrectRule,
  // Managed — unmanaged class must be empty.
  skillsManagedRule,
  // Pack dependencies resolved (configured packs).
  packsDependenciesResolvedRule,
  // Implicit retained by pack.
  packsMembersRetainedRule,
  recommendedPacksRetainedRule,
];

// Register ids into the `LintConfig.rules` allowlist. Module-load side effect:
// a consumer that imports this catalog (or the `catalog/index` barrel) enables
// `.axm/settings.json` `lint.rules` to reference any of the above rule ids.
registerLintRuleIds(workspaceRules.map((r) => r.id));
