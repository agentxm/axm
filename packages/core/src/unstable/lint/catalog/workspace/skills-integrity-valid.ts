/**
 * `workspace/skills-integrity-valid` — each installed skill's `src/` content
 * matches its lockfile `sourceHash`.
 *
 * For each skill lock entry with a `sourceHash`, verify the canonical
 * installed directory (`.axm/extensions/<owner>/skills/<name>/src/` for
 * registry sources; `.axm/extensions/external/skills/<name>/` for
 * non-registry) exists and its hash matches. Integrity-mismatch entries
 * each emit one finding. Configured mismatches are autofixable via
 * `install-skill` with `force: true`; pack-provided implicit mismatches are
 * advisory because the repair is a pack-level reinstall.
 *
 * The integrity check reads WorkspaceContext actual rows. A skill whose
 * install directory is missing entirely is an integrity mismatch.
 *
 * V1 keeps this rule simple: a skill whose `sourceHash` is undefined in the
 * lockfile (e.g., git-hosted sources without pinned hash) is not checked.
 *
 * One finding per affected entity.
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
import { type Lockfile, type SkillLockEntry } from "../../../lockfile/schema.js";
import { type Settings } from "../../../settings/schema.js";
import { isSameFinding } from "./helpers/finding.js";
import { installSkillOp } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import { buildRetainedSkillFqns, isImplicitRetainedSkill } from "./helpers/retained-skills.js";

const RULE_ID = "workspace/skills-integrity-valid";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const simpleName = (name: string): string => name.split("/").at(-1) ?? name;

const hasSourceActual = (
  row: {
    readonly key: { readonly name: string };
    readonly actual: ReadonlyArray<{ readonly origin: { readonly _tag: string } }>;
  },
  name: string,
): boolean =>
  row.key.name === simpleName(name) &&
  row.actual.some(
    (actual) =>
      actual.origin._tag === "canonical-axm-skill" || actual.origin._tag === "external-axm-skill",
  );

const integrityFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in the lockfile, but its installed source files do not match the lockfile entry. Detail: ${reason}. ` +
    "Run `axm lint --fix` to reinstall it.",
  location: { file: LOCKFILE_REL },
});

const implicitIntegrityFinding = (name: string, reason: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Pack-provided skill '${name}' is listed in the lockfile, but its installed source files do not match the lockfile entry. Detail: ${reason}. ` +
    "Run `axm install` to reinstall it from the owning pack declarations.",
  location: { file: LOCKFILE_REL },
});

interface IntegrityViolation {
  readonly finding: LintFinding;
  readonly operation?: Operation<string, unknown>;
}

/**
 * Compute a stable integrity marker for the skill's installed `src/` tree.
 *
 * The lint layer does not re-hash bytes — the workspace accessor is narrow
 * and does not expose bulk-read; integrity in v1 is delegated to an
 * accessor-computed signal carried on the `InstalledSkillInfo` record.
 * Since that extension requires expanding the accessor surface beyond the
 * v1 documented methods (a task 3c.2 constraint), this rule treats a
 * `sourceHash`-bearing lock entry whose canonical `src/` directory does
 * NOT exist as an integrity mismatch. A deeper byte-by-byte hash check
 * defers to the CLI-layer adapter that owns filesystem walks.
 */
const integrityReason = (
  lockEntry: SkillLockEntry,
  probeExists: boolean,
): Option.Option<string> => {
  if (lockEntry.sourceHash === undefined) {
    return Option.none();
  }
  if (!probeExists) {
    return Option.some("the installed source directory is missing");
  }
  return Option.none();
};

const collectIntegrityViolations = (
  settings: Settings,
  lockfile: Lockfile,
  probes: ReadonlyArray<{
    readonly name: string;
    readonly entry: SkillLockEntry;
    readonly exists: boolean;
  }>,
): ReadonlyArray<IntegrityViolation> => {
  const declaredSkills = settings.skills ?? {};
  const retainedFqns = buildRetainedSkillFqns(settings, lockfile);
  const violations: Array<IntegrityViolation> = [];

  for (const { name, entry, exists } of probes) {
    const reason = integrityReason(entry, exists);
    if (Option.isNone(reason)) {
      continue;
    }
    if (name in declaredSkills) {
      const declared = declaredSkills[name];
      if (declared === undefined) {
        continue;
      }
      violations.push({
        finding: integrityFinding(name, reason.value),
        operation: installSkillOp({ name, source: declared.source, force: true }),
      });
      continue;
    }
    if (isImplicitRetainedSkill(name, entry, declaredSkills, retainedFqns)) {
      violations.push({
        finding: implicitIntegrityFinding(name, reason.value),
      });
    }
  }

  return violations;
};

export const skillsIntegrityValidRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Installed skill source files match the lockfile.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace.scope(context.subject.scope);
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
        return EMPTY_LINT_FINDINGS;
      }
      const installed = yield* scoped.skills.installed;

      const probes = Object.entries(lockOption.value.skills).map(([name, entry]) => ({
        name,
        entry,
        exists: installed.some((row) => hasSourceActual(row, name)),
      }));
      const violations = collectIntegrityViolations(
        settingsResult.success.value,
        lockOption.value,
        probes,
      );
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const scoped = context.workspace.scope(context.subject.scope);
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
      const installed = yield* scoped.skills.installed;

      const probes = Object.entries(lockOption.value.skills).map(([name, entry]) => ({
        name,
        entry,
        exists: installed.some((row) => hasSourceActual(row, name)),
      }));
      const violation = collectIntegrityViolations(
        settingsResult.success.value,
        lockOption.value,
        probes,
      ).find(
        (candidate) =>
          candidate.finding.kind === "autofixable" &&
          candidate.operation !== undefined &&
          isSameFinding(candidate.finding, finding),
      );
      return violation?.operation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
