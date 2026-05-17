/**
 * `workspace/skills-managed` — installed skill directories are managed by the
 * axm workspace.
 *
 * A skill artifact is unmanaged iff the workspace read-model record classifies the
 * detected skill name as `lifecycle: "unmanaged"`. The rule emits one advisory
 * finding per unmanaged artifact location reported by the read-model record.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { buildRetainedSkillFqns } from "./helpers/retained-skills.js";

const RULE_ID = "workspace/skills-managed";
const relativeToRoot = (root: string, location: string): string => {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return location.startsWith(prefix) ? location.slice(prefix.length) : location;
};

const retainedFqnFor = (name: string): string | undefined =>
  name.startsWith("@") ? name : undefined;

const unmanagedFinding = (name: string, location: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is present here, but it is not managed by this workspace. ` +
    `To adopt it, run \`axm skills install <source>\` with the intended source for '${name}'. ` +
    `To fork, ignore, or prune it, use \`axm help skills\` to choose the right resolution.`,
  location: { file: location },
});

export const skillsManagedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  // Keep the public description short and invariant-focused; the module docs
  // carry the narrower artifact-level implementation detail.
  description: "Skills are managed by the workspace.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      const retainedFqns =
        Result.isSuccess(settingsResult) &&
        Result.isSuccess(lockfileResult) &&
        Option.isSome(settingsResult.success) &&
        Option.isSome(lockfileResult.success)
          ? buildRetainedSkillFqns(settingsResult.success.value, lockfileResult.success.value)
          : new Set<string>();
      const retainedNames = new Set(
        Array.from(retainedFqns).map((fqn) => fqn.split("/").at(-1) ?? fqn),
      );
      const unmanaged = yield* scoped.skills.unmanaged;
      const seen = new Set<string>();
      const findings: Array<AdvisoryFinding> = [];
      for (const entry of unmanaged) {
        const retainedFqn = retainedFqnFor(entry.key.name);
        if (
          retainedNames.has(entry.key.name) ||
          (retainedFqn !== undefined && retainedFqns.has(retainedFqn))
        ) {
          continue;
        }
        const identity = `${entry.key.name}\0${entry.actual.contentRoot}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        findings.push(
          unmanagedFinding(
            entry.key.name,
            relativeToRoot(context.subject.root, entry.actual.contentRoot),
          ),
        );
      }
      return findings;
    }),
};
