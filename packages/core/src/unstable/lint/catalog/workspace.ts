/**
 * `workspace/*` rule catalog — the v1 thirteen-rule set.
 *
 * Per `docs/design/lint-engine.md §10.workspace`, `axm lint` (locally only —
 * never publish) runs exactly these rules against each workspace context:
 *
 * | ID                                      | Severity | Autofix     |
 * | --------------------------------------- | -------- | ----------- |
 * | `workspace/initialized`                 | error    | —           |
 * | `workspace/settings-schema-valid`       | error    | —           |
 * | `workspace/lockfile-valid`              | error    | autofixing  |
 * | `workspace/agents-recognized`           | error    | —           |
 * | `workspace/agents-detected-declared`    | warning  | —           |
 * | `workspace/skills-declarations-valid`   | error    | —           |
 * | `workspace/skills-lockfile-aligned`     | error    | autofixing  |
 * | `workspace/skills-integrity-valid`      | error    | autofixing  |
 * | `workspace/skills-artifacts-correct`    | error    | autofixing  |
 * | `workspace/skills-artifacts-clean`      | error    | mixed       |
 * | `workspace/packs-declarations-valid`    | error    | —           |
 * | `workspace/packs-dependencies-resolved` | error    | —           |
 * | `workspace/packs-members-retained`      | warning  | —           |
 *
 * Autofix rides per-extension Operations only (§6). No `editFile`,
 * `writeFile`, or `syncWorkspace()` reference — arms whose remediation can't
 * be expressed in the 14-operation vocabulary ship as `AdvisoryFinding` with a
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
import { lockfileValidRule } from "./workspace/lockfile-valid.js";
import { agentsRecognizedRule } from "./workspace/agents-recognized.js";
import { agentsDetectedDeclaredRule } from "./workspace/agents-detected-declared.js";
import { skillsDeclarationsValidRule } from "./workspace/skills-declarations-valid.js";
import { skillsLockfileAlignedRule } from "./workspace/skills-lockfile-aligned.js";
import { skillsIntegrityValidRule } from "./workspace/skills-integrity-valid.js";
import { skillsArtifactsCorrectRule } from "./workspace/skills-artifacts-correct.js";
import { skillsArtifactsCleanRule } from "./workspace/skills-artifacts-clean.js";
import { packsDeclarationsValidRule } from "./workspace/packs-declarations-valid.js";
import { packsDependenciesResolvedRule } from "./workspace/packs-dependencies-resolved.js";
import { packsMembersRetainedRule } from "./workspace/packs-members-retained.js";

/**
 * Ordered v1 `workspace/*` rule catalog. Declaration order is the evaluation
 * order within a single `evaluateContexts` call (deterministic ordering is
 * test-observable; see `evaluate.ts`). The catalog groups foundation rules
 * first, then the skills install family, then the packs install family — the
 * same order the design doc tables list them in.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const workspaceRules: ReadonlyArray<LintRule<WorkspaceRuleContext>> = [
  // Foundation (type-agnostic workspace well-formedness).
  initializedRule,
  settingsSchemaValidRule,
  lockfileValidRule,
  agentsRecognizedRule,
  agentsDetectedDeclaredRule,
  // Skills install family (Settings ↔ Lockfile ↔ Disk).
  skillsDeclarationsValidRule,
  skillsLockfileAlignedRule,
  skillsIntegrityValidRule,
  skillsArtifactsCorrectRule,
  skillsArtifactsCleanRule,
  // Packs install family (Settings ↔ Lockfile).
  packsDeclarationsValidRule,
  packsDependenciesResolvedRule,
  packsMembersRetainedRule,
];

// Register ids into the `LintConfig.rules` allowlist. Module-load side effect:
// a consumer that imports this catalog (or the `catalog/index` barrel) enables
// `.axm/settings.json` `lint.rules` to reference any of the above rule ids.
registerLintRuleIds(workspaceRules.map((r) => r.id));
