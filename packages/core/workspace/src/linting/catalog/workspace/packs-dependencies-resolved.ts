import * as Effect from "effect/Effect";
import { canonicalObservationFactText } from "../../../projection/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { observationsReportedBy } from "./canonical-observation-findings.js";
import { lockfileDisplayPath } from "../../../desired-state/index.js";

const RULE_ID = "workspace/packs-dependencies-resolved";

/** Pack membership comes from the desired graph; the canonical observation judges its resolution. */
export const packsDependenciesResolvedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Pack-declared external dependencies have accepted resolutions.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(observationsReportedBy(context, RULE_ID), (observed) =>
      observed.map(({ desired, observation }): AdvisoryFinding => ({
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "error",
        message: `Pack-declared ${canonicalObservationFactText(desired, observation)}.`,
        location: { file: lockfileDisplayPath(context.subject.scope) },
      })),
    ),
};
