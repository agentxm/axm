/** Reports alignment between desired external Skills and accepted resolutions. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { desiredReachesAcceptedRow } from "../../../desired-state/index.js";
import { canonicalObservationFactText } from "../../../projection/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { observationsReportedBy } from "./canonical-observation-findings.js";
import { lockfileDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/skills-lockfile-aligned";

const finding = (message: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  location: { file: path },
});

export const skillsLockfileAlignedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Desired external Skills and accepted resolutions stay aligned.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graph = yield* Effect.result(context.health.desiredState);
      const lockfile = yield* Effect.result(context.workspace.state.lockfile);
      if (
        Result.isFailure(graph) ||
        Result.isFailure(lockfile) ||
        Option.isNone(lockfile.success)
      ) {
        return [];
      }
      const lockfilePath = lockfileDisplayPath(context.subject.scope);
      const unresolved = (yield* observationsReportedBy(context, RULE_ID)).map(
        ({ desired, observation }) =>
          finding(`${canonicalObservationFactText(desired, observation)}.`, lockfilePath),
      );
      // A row no desired Skill reaches is retirement's to remove; the same
      // predicate decides it here, so lint never reports what sync keeps.
      const undesired = Object.keys(lockfile.success.value.skills)
        .filter((name) => !desiredReachesAcceptedRow(graph.success, { type: "skill", key: name }))
        .map((name) =>
          finding(`Skill '${name}' has an accepted resolution but is not desired.`, lockfilePath),
        );
      return [...unresolved, ...undesired];
    }),
};
