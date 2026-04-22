/**
 * `workspace/skills-lockfile-aligned` — skill lock entries correspond 1:1 to
 * declared skills at satisfying versions.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace.Skills` (first
 * failing arm per affected entity):
 *
 * 1. **Missing** — every declared skill has a matching lock entry.
 *    Autofix: `install-skill` with `force: false` per missing declaration.
 * 2. **Orphan** — every skill lock entry has a matching declaration **or**
 *    is `retainedByPack: true` AND a matching installed declared pack
 *    declares it. Autofix: `uninstall-skill` per orphan lock entry.
 *    Retention carve-out: `retainedByPack: true` entries whose FQN appears
 *    in the resolved-map of at least one installed declared pack are NOT
 *    orphans.
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
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import type { Operation } from "../../../plan/plan.js";
import { LockfileSchema, type Lockfile, type SkillLockEntry } from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { installSkillOp, uninstallSkillOp } from "./helpers/install-ops.js";
import { parseRegistrySource } from "./helpers/registry-source.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/skills-lockfile-aligned";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const decodeLockfile = (input: unknown): Option.Option<Lockfile> => {
  const result = Schema.decodeUnknownResult(LockfileSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const missingFinding = (name: string, source: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in settings.skills but missing from the lockfile. ` +
    `Run \`axm lint --fix\` to reinstall it from '${source}' and add the lock entry.`,
  location: { file: LOCKFILE_REL },
});

const orphanFinding = (name: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in the lockfile but not in settings.skills. ` +
    "Run `axm lint --fix` to remove that lockfile entry.",
  location: { file: LOCKFILE_REL },
});

const versionFinding = (name: string, details: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in settings.skills and the lockfile, but the lockfile version does not match the declared version. ` +
    `Detail: ${details}. Run \`axm lint --fix\` to reinstall it at the declared version.`,
  location: { file: LOCKFILE_REL },
});

interface AlignmentViolation {
  readonly finding: AutofixableFinding;
  readonly operation: Operation<string, unknown>;
}

// -----------------------------------------------------------------------------
// Retention helpers
// -----------------------------------------------------------------------------

const isRegistryEntry = (
  entry: SkillLockEntry,
): entry is Extract<SkillLockEntry, { readonly type: "registry" }> => entry.type === "registry";

const lockEntryFqn = (entry: SkillLockEntry, name: string): string => {
  if (isRegistryEntry(entry)) {
    return `${entry.owner}/skills/${entry.name}`;
  }
  return `skills/${name}`;
};

/**
 * Build the set of FQNs retained by at least one installed declared pack.
 * An entry is retained only when:
 *
 * - its lockfile entry has `retainedByPack: true`, AND
 * - at least one pack lock entry's `resolvedSkills` map has a key matching
 *   the entry's FQN, AND
 * - that pack name appears in `settings.packs`.
 */
const buildRetainedSkillFqns = (settings: Settings, lockfile: Lockfile): ReadonlySet<string> => {
  const declaredPackNames = new Set(Object.keys(settings.packs ?? {}));
  const retained = new Set<string>();
  const packLock = lockfile.packs ?? {};
  for (const [packName, packEntry] of Object.entries(packLock)) {
    if (!declaredPackNames.has(packName)) {
      continue;
    }
    for (const fqn of Object.keys(packEntry.resolvedSkills)) {
      retained.add(fqn);
    }
  }
  return retained;
};

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
    if (entry.retainedByPack === true && retainedFqns.has(lockEntryFqn(entry, name))) {
      continue;
    }
    violations.push({
      finding: orphanFinding(name),
      operation: uninstallSkillOp({ name }),
    });
    affected.add(`lock:${name}`);
  }

  for (const [name, entry] of Object.entries(declaredSkills)) {
    if (affected.has(`declared:${name}`)) {
      continue;
    }
    const lockEntry = lockSkills[name];
    if (lockEntry === undefined || !isRegistryEntry(lockEntry)) {
      continue;
    }
    const parsed = parseRegistrySource(entry.source);
    if (parsed === undefined) {
      continue;
    }
    const constraint = parsed.versionConstraint;
    if (constraint === undefined || constraint === lockEntry.resolvedVersion) {
      continue;
    }
    violations.push({
      finding: versionFinding(name, `declared ${constraint}, locked ${lockEntry.resolvedVersion}`),
      operation: installSkillOp({ name, source: entry.source, force: true }),
    });
  }

  return violations;
};

const isSameFinding = (left: AutofixableFinding, right: AutofixableFinding): boolean =>
  left.ruleId === right.ruleId &&
  left.message === right.message &&
  left.location?.file === right.location?.file;

export const skillsLockfileAlignedRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill lock entries correspond 1:1 to declared skills at satisfying versions.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_LINT_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        // workspace/lockfile-valid owns the missing arm.
        return EMPTY_LINT_FINDINGS;
      }
      const lockfile = decodeLockfile(lockOption.value);
      if (Option.isNone(lockfile)) {
        // workspace/lockfile-valid owns the schema arm.
        return EMPTY_LINT_FINDINGS;
      }

      const violations = collectAlignmentViolations(settings.value, lockfile.value);
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_OPERATIONS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_OPERATIONS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_OPERATIONS;
      }
      const lockfile = decodeLockfile(lockOption.value);
      if (Option.isNone(lockfile)) {
        return EMPTY_OPERATIONS;
      }

      const violation = collectAlignmentViolations(settings.value, lockfile.value).find(
        (candidate) => isSameFinding(candidate.finding, finding),
      );
      return violation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
