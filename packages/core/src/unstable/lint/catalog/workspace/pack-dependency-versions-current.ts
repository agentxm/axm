import * as Effect from "effect/Effect";
import type { PackDependencyReachability } from "../../../packs/dependency-reachability.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import type { WorkspaceRuleContext } from "../../context.js";

const RULE_ID = "workspace/pack-dependency-versions-current";

const excludedFinding = (record: PackDependencyReachability): AdvisoryFinding => {
  const observed = `${record.memberFqn}@${record.memberVersion ?? "unknown"}`;
  const suggestions =
    record.packAuthority === "workspace"
      ? [
          {
            description: "Replace the authored pack constraint with the current workspace version",
            cmd: `axm packs add ${record.packFqn} ${record.memberFqn} --replace-existing`,
          },
        ]
      : [
          {
            description:
              "Update the pack if its owner has published a constraint that includes the workspace version",
            cmd: `axm packs update ${record.packFqn}`,
          },
          {
            description: `Otherwise stop workspace authority from shadowing ${record.memberFqn}`,
          },
        ];
  return {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "error",
    message: `${record.packFqn} requires ${record.memberFqn}@${record.constraint}, but the workspace resolves ${observed}.`,
    location: { file: record.manifestPath },
    suggestions,
  };
};

export const packDependencyVersionsCurrentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Known pack members satisfy their declared dependency versions.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    context.packDependencyReachability === undefined
      ? Effect.succeed([])
      : Effect.map(context.packDependencyReachability, packDependencyVersionFindings),
};

export const packDependencyVersionFindings = (
  records: ReadonlyArray<PackDependencyReachability>,
): ReadonlyArray<AdvisoryFinding> =>
  records
    .filter(
      (record) =>
        record.classification === "excluded" &&
        (record.packAuthority === "workspace" || record.memberAuthority === "workspace"),
    )
    .map(excludedFinding);
