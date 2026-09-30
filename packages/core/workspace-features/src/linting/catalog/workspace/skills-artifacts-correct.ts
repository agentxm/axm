/** Skill realization findings derived from the shared native location observations. */
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { settingsDisplayPath } from "@agentxm/workspace-kernel/workspace-state";
import { deferringNodes } from "./canonical-observation-findings.js";

const RULE_ID = "workspace/skills-artifacts-correct";

export const skillsArtifactsCorrectRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill directories match each skill's enabled state across declared agents.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.nativeSkills === undefined) return [];
      const finding = (message: string): AdvisoryFinding => ({
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "error",
        message,
        location: { file: settingsDisplayPath(context.subject.scope) },
      });
      const observed = yield* Effect.result(context.nativeSkills);
      if (Result.isFailure(observed))
        return [finding("Native Skill locations could not be verified for this workspace.")];
      const deferred = yield* deferringNodes(context);
      return observed.success.flatMap(({ name, enabled, implicit, observation }) => {
        if (deferred.has(`skill:${name}`)) return [];
        const subject = `${implicit ? "Pack-provided skill" : "Skill"} '${name}'`;
        if (!enabled)
          return observation.nativeLocations.some((unit) => unit.ownership === "owned")
            ? [finding(`${subject} is disabled, but owned native output is still present.`)]
            : [];
        const missingPolicy = observation.nativeLocations.some(
          (unit) =>
            unit.state === "absent" && unit.policyReasons.includes("workspace-shared-skills"),
        );
        const missingAgents = observation.agentOutcomes
          .filter((outcome) => outcome.reasonCode === "projection-missing")
          .map((outcome) => outcome.agentId);
        if (missingPolicy || missingAgents.length > 0) {
          const reasons = [
            ...(missingAgents.length > 0 ? [`declared agents: ${missingAgents.join(", ")}`] : []),
            ...(missingPolicy ? ["the shared Skill policy location"] : []),
          ];
          return [
            finding(`${subject} is enabled, but it is missing from ${reasons.join(" and ")}.`),
          ];
        }
        const ownedConflict = observation.nativeLocations.some(
          (unit) => unit.ownership === "owned" && unit.state === "blocked",
        );
        return ownedConflict
          ? [finding(`${subject} has owned native output that differs from its canonical content.`)]
          : [];
      });
    }),
};
