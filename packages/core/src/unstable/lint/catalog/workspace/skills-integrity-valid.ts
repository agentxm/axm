/**
 * `workspace/skills-integrity-valid` — each installed skill listed in the
 * lockfile is present on disk.
 *
 * For each skill lock entry with a `sourceHash`, verify the canonical
 * installed directory (`.axm/extensions/<owner>/skills/<name>/src/` for
 * registry sources; `.axm/extensions/external/skills/<name>/` for
 * non-registry) exists. Missing-directory entries each emit one finding.
 * Configured findings are autofixable via `install-skill` with
 * `force: true`; pack-provided implicit findings are advisory because the
 * repair is a pack-level reinstall.
 *
 * This rule never compares installed bytes against `sourceHash`. Installed
 * canonical content is workspace-owned after install: content-preserving
 * workspace tools (formatters, line-ending normalization) may rewrite it,
 * and such differences are not defects. Archive integrity is enforced at
 * download time by the installer, not by this rule. If content-drift
 * detection is added later it must stay advisory and tolerate
 * formatting-only differences.
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

const RULE_ID = "workspace/skills-integrity-valid";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

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

const integrityFinding = (name: string, reason: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' has an accepted resolution, but ${reason}.`,
  location: { file: LOCKFILE_REL },
});

/**
 * Presence probe for the skill's installed `src/` tree.
 *
 * Deliberately existence-only: installed content is workspace-owned after
 * install, so this rule never re-hashes bytes against `sourceHash` — a tree
 * rewritten by a formatter or other content-preserving tool is not a
 * defect. Only a `sourceHash`-bearing lock entry whose canonical `src/`
 * directory does NOT exist yields a finding.
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
): ReadonlyArray<LintFinding> => {
  const findings: Array<LintFinding> = [];

  for (const { name, entry, exists } of probes) {
    if (!desiredNames.has(name)) continue;
    const reason = integrityReason(entry, exists);
    if (Option.isNone(reason)) {
      continue;
    }
    findings.push(integrityFinding(name, reason.value));
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
      return collectIntegrityFindings(desiredNames, probes);
    }),
};
