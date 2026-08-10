/**
 * `workspace/skills-lockfile-aligned` — skill lock entries correspond 1:1 to
 * declared skills at satisfying versions.
 *
 * Cascade per `agentxm-internal/docs/design/lint-engine.md §10.workspace.Skills` (first
 * failing arm per affected entity):
 *
 * 1. **Missing** — every declared skill has a matching lock entry.
 *    Autofix: `install-skill` with `force: false` per missing declaration.
 * 2. **Receipt-only** — every skill lock entry has a matching declaration **or**
 *    a matching installed declared pack declares it. Advisory: the user must
 *    choose to declare the exact installed source or uninstall it explicitly.
 *    Pack membership is derived from the authoritative installed-pack graph.
 * 3. **Version skew** — each lock entry's `resolvedVersion` satisfies the
 *    declared version constraint (for registry sources). Autofix:
 *    `install-skill` with `force: true`.
 *
 * One finding per affected entity. Autofixing — each arm emits exactly one
 * Operation per affected entity.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type {
  AdvisoryFinding,
  AutofixableFinding,
  AutofixingRule,
  LintFinding,
} from "../../rule.js";
import type { Operation } from "../../../plan/plan.js";
import { type Lockfile } from "../../../lockfile/schema.js";
import { type Settings } from "../../../settings/schema.js";
import { installSkillOp } from "./helpers/install-ops.js";
import { parseRegistrySourceRef } from "../../../extensions/registry-source.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import { isSameFinding } from "./helpers/finding.js";
import {
  buildRetainedSkillFqns,
  isRegistrySkillLockEntry,
  isImplicitRetainedSkill,
} from "./helpers/retained-skills.js";
import { versionSatisfiesRange } from "../../../version-constraints/version-constraints.js";
import { printSkillLockSourceLocator } from "../../../sources/index.js";

const RULE_ID = "workspace/skills-lockfile-aligned";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const missingFinding = (name: string, source: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in settings.skills but missing from the lockfile. ` +
    `Run \`axm lint --fix\` to reinstall it from '${source}' and add the lock entry.`,
  location: { file: LOCKFILE_REL },
});

const receiptOnlyFinding = (name: string, source: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in the lockfile but not in settings.skills. ` +
    `Run \`axm skills install ${source}\` to declare and retain it, or ` +
    `run \`axm skills uninstall ${name}\` to remove it explicitly.`,
  location: { file: LOCKFILE_REL },
});

const versionFinding = (name: string, details: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in settings.skills and the lockfile, but the versions do not match. ` +
    `${details}. Run \`axm lint --fix\` to reinstall it at the declared version.`,
  location: { file: LOCKFILE_REL },
});

type AlignmentViolation =
  | {
      readonly finding: AutofixableFinding;
      readonly operation: Operation<string, unknown>;
    }
  | {
      readonly finding: AdvisoryFinding;
    };

// -----------------------------------------------------------------------------
// Retention helpers
// -----------------------------------------------------------------------------

const collectAlignmentViolations = (
  settings: Settings,
  lockfile: Lockfile,
): ReadonlyArray<AlignmentViolation> => {
  const declaredSkills = settings.skills ?? {};
  const lockSkills = lockfile.skills;
  const retainedFqns = buildRetainedSkillFqns(settings, lockfile);
  const violations: Array<AlignmentViolation> = [];
  const affected = new Set<string>();

  for (const [name, entry] of Object.entries(declaredSkills)) {
    if (name in lockSkills) {
      continue;
    }
    violations.push({
      finding: missingFinding(name, entry.source),
      operation: installSkillOp({ name, source: entry.source, force: false }),
    });
    affected.add(`declared:${name}`);
  }

  for (const [name, entry] of Object.entries(lockSkills)) {
    if (name in declaredSkills) {
      continue;
    }
    if (isImplicitRetainedSkill(name, entry, declaredSkills, retainedFqns)) {
      continue;
    }
    violations.push({
      finding: receiptOnlyFinding(name, printSkillLockSourceLocator(name, entry)),
    });
    affected.add(`lock:${name}`);
  }

  for (const [name, entry] of Object.entries(declaredSkills)) {
    if (affected.has(`declared:${name}`)) {
      continue;
    }
    const lockEntry = lockSkills[name];
    if (lockEntry === undefined || !isRegistrySkillLockEntry(lockEntry)) {
      continue;
    }
    const parsed = parseRegistrySourceRef(entry.source);
    if (parsed === undefined) {
      continue;
    }
    const constraint = parsed.versionRange;
    if (constraint === undefined || versionSatisfiesRange(lockEntry.resolvedVersion, constraint)) {
      continue;
    }
    violations.push({
      finding: versionFinding(
        name,
        `Declared version: ${constraint}. Locked version: ${lockEntry.resolvedVersion}`,
      ),
      operation: installSkillOp({ name, source: entry.source, force: true }),
    });
  }

  return violations;
};

export const skillsLockfileAlignedRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Declared skills and lockfile entries stay aligned.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_LINT_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        // workspace/lockfile-valid owns the missing arm.
        return EMPTY_LINT_FINDINGS;
      }
      const violations = collectAlignmentViolations(settingsResult.success.value, lockOption.value);
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_OPERATIONS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_OPERATIONS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_OPERATIONS;
      }
      const violation = collectAlignmentViolations(
        settingsResult.success.value,
        lockOption.value,
      ).find((candidate) => isSameFinding(candidate.finding, finding));
      return violation === undefined || !("operation" in violation)
        ? EMPTY_OPERATIONS
        : [violation.operation];
    }),
};
