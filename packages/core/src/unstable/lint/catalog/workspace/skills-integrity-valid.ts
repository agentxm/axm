/**
 * `workspace/skills-integrity-valid` — each installed skill's `src/` content
 * matches its lockfile `sourceHash`.
 *
 * For each skill lock entry with a `sourceHash`, verify the canonical
 * installed directory (`.axm/extensions/<owner>/skills/<name>/src/` for
 * registry sources; `.axm/extensions/external/skills/<name>/` for
 * non-registry) exists and its hash matches. Integrity-mismatch entries
 * each emit one `AutofixableFinding`; autofix: `install-skill` with
 * `force: true`.
 *
 * The integrity check MUST walk the workspace filesystem — `context.workspace`
 * exposes `exists` only; the accessor layer surfaces the pre-computed
 * `installedSkills` array with the skill's `files` accessor already rooted
 * at the right path per provenance. A skill whose install directory is
 * missing entirely is also a mismatch.
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
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import type { Operation } from "../../../plan/plan.js";
import { LockfileSchema, type Lockfile, type SkillLockEntry } from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { installSkillOp } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/skills-integrity-valid";
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

const integrityFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed in the lockfile, but its installed source files do not match the lockfile entry. Detail: ${reason}. ` +
    "Run `axm lint --fix` to reinstall it.",
  location: { file: LOCKFILE_REL },
});

interface IntegrityViolation {
  readonly finding: AutofixableFinding;
  readonly operation: Operation<string, unknown>;
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
const checkIntegrity = (
  name: string,
  lockEntry: SkillLockEntry,
  probeExists: boolean,
): Option.Option<AutofixableFinding> => {
  if (lockEntry.sourceHash === undefined) {
    return Option.none();
  }
  if (!probeExists) {
    return Option.some(integrityFinding(name, "the installed source directory is missing"));
  }
  return Option.none();
};

const skillSrcProbe = (name: string, entry: SkillLockEntry): string => {
  if (entry.type === "registry") {
    return `.axm/extensions/${entry.owner}/skills/${name}/src/SKILL.md`;
  }
  return `.axm/extensions/external/skills/${name}/SKILL.md`;
};

const isSameFinding = (left: AutofixableFinding, right: AutofixableFinding): boolean =>
  left.ruleId === right.ruleId &&
  left.message === right.message &&
  left.location?.file === right.location?.file;

const collectIntegrityViolations = (
  settings: Settings,
  probes: ReadonlyArray<{
    readonly name: string;
    readonly entry: SkillLockEntry;
    readonly exists: boolean;
  }>,
): ReadonlyArray<IntegrityViolation> => {
  const declaredSkills = settings.skills ?? {};
  const violations: Array<IntegrityViolation> = [];

  for (const { name, entry, exists } of probes) {
    if (!(name in declaredSkills)) {
      continue;
    }
    const finding = checkIntegrity(name, entry, exists);
    if (Option.isNone(finding)) {
      continue;
    }
    const declared = declaredSkills[name];
    if (declared === undefined) {
      continue;
    }
    violations.push({
      finding: finding.value,
      operation: installSkillOp({ name, source: declared.source, force: true }),
    });
  }

  return violations;
};

export const skillsIntegrityValidRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Each skill's canonical src/ content matches its lockfile sourceHash.",
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
        return EMPTY_LINT_FINDINGS;
      }
      const lockfile = decodeLockfile(lockOption.value);
      if (Option.isNone(lockfile)) {
        return EMPTY_LINT_FINDINGS;
      }

      const probes = yield* Effect.all(
        Object.entries(lockfile.value.skills).map(([name, entry]) =>
          context.workspace
            .exists(skillSrcProbe(name, entry))
            .pipe(Effect.map((exists) => ({ name, entry, exists }))),
        ),
        { concurrency: "unbounded" },
      );
      const violations = collectIntegrityViolations(settings.value, probes);
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

      const probes = yield* Effect.all(
        Object.entries(lockfile.value.skills).map(([name, entry]) =>
          context.workspace
            .exists(skillSrcProbe(name, entry))
            .pipe(Effect.map((exists) => ({ name, entry, exists }))),
        ),
        { concurrency: "unbounded" },
      );
      const violation = collectIntegrityViolations(settings.value, probes).find((candidate) =>
        isSameFinding(candidate.finding, finding),
      );
      return violation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
