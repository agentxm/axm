/**
 * `workspace/skills-integrity-valid` — each installed skill listed in the
 * lockfile is present on disk.
 *
 * For each accepted skill lock entry, verify that its canonical acquired
 * package is present in the scope's canonical root. Missing-package entries
 * each emit one finding.
 * Configured findings are autofixable via `install-skill` with
 * `force: true`; pack-provided implicit findings are advisory because the
 * repair is a pack-level reinstall.
 *
 * This rule owns only the missing-package arm. Package-tree integrity is
 * evaluated by canonical observations against `treeIntegrity`; local edits,
 * including formatter changes, are drift and block affected reads and
 * mutation closures until explicit recovery.
 *
 * A skill whose `sourceHash` is undefined in the lockfile (e.g., git-hosted
 * sources without pinned hash) is not checked.
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
import type { AdvisoryFinding, AdvisoryRule, LintFinding } from "../../rule.js";
import { type SkillLockEntry } from "../../../lockfile/schema.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import { lockfileDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/skills-integrity-valid";

const simpleName = (name: string): string => name.split("/").at(-1) ?? name;

const hasSourceActual = (
  actual: ReadonlyArray<{
    readonly key: { readonly name: string };
    readonly origin: { readonly _tag: string };
  }>,
  name: string,
): boolean =>
  actual.some(
    (occurrence) =>
      occurrence.key.name === simpleName(name) &&
      (occurrence.origin._tag === "canonical-axm-skill" ||
        occurrence.origin._tag === "external-axm-skill"),
  );

const integrityFinding = (name: string, reason: string, lockfilePath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' has an accepted resolution, but ${reason}.`,
  location: { file: lockfilePath },
});

/**
 * Presence probe for the skill's acquired package tree. Integrity drift is a
 * separate canonical-observation fact, so this helper owns only absence.
 */
const integrityReason = (
  lockEntry: SkillLockEntry,
  probeExists: boolean,
): Option.Option<string> => {
  if (!probeExists) {
    return Option.some("its installed source directory is missing");
  }
  return Option.none();
};

const collectIntegrityFindings = (
  desiredNames: ReadonlySet<string>,
  probes: ReadonlyArray<{
    readonly name: string;
    readonly entry: SkillLockEntry;
    readonly exists: boolean;
  }>,
  lockfilePath: string,
): ReadonlyArray<LintFinding> => {
  const findings: Array<LintFinding> = [];

  for (const { name, entry, exists } of probes) {
    if (!desiredNames.has(name)) continue;
    const reason = integrityReason(entry, exists);
    if (Option.isNone(reason)) {
      continue;
    }
    findings.push(integrityFinding(name, reason.value, lockfilePath));
  }

  return findings;
};

export const skillsIntegrityValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Installed skills listed in the lockfile are present on disk.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      if (Result.isFailure(lockfileResult) || context.health === undefined) {
        return EMPTY_LINT_FINDINGS;
      }
      const graphResult = yield* Effect.result(context.health.desiredState);
      if (Result.isFailure(graphResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_LINT_FINDINGS;
      }
      const actual = yield* scoped.skills.actual;

      const probes = Object.entries(lockOption.value.skills).map(([name, entry]) => ({
        name,
        entry,
        exists: hasSourceActual(actual, name),
      }));
      const desiredNames = new Set(
        graphResult.success.nodes.filter((node) => node.type === "skill").map((node) => node.name),
      );
      return collectIntegrityFindings(
        desiredNames,
        probes,
        lockfileDisplayPath(context.subject.scope),
      );
    }),
};
