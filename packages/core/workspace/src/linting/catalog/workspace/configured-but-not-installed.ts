/**
 * Reports desired extensions whose canonical content is absent.
 *
 * The canonical observation is the judge: a desired node observed `missing`
 * has an accepted resolution, or is workspace-authored, and no canonical
 * content. Desired means the desired-state graph holds the node, whatever its
 * activation — sync realizes a disabled node's content as it does an enabled
 * one's — so a member of a disabled Pack, which the graph does not hold, is
 * not reported.
 */
import * as Effect from "effect/Effect";
import { extensionTypeSentenceLabels } from "@agentxm/extension-model/unstable/extensions/common";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { DesiredExtensionNode } from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { acquiredRootDisplayPath, settingsDisplayPath } from "../../../desired-state/index.js";
import { observationsReportedBy } from "./canonical-observation-findings.js";

const RULE_ID = "workspace/configured-but-not-installed";

/** Whether the node's direct declaration names a workspace source. */
const declaresWorkspaceSource = (desired: DesiredExtensionNode): boolean =>
  desired.origins.some(
    (origin) =>
      origin.type === "settings" &&
      origin.source !== undefined &&
      isWorkspaceSourceLocator(origin.source),
  );

const findingFor = (
  desired: DesiredExtensionNode,
  scope: WorkspaceRuleContext["subject"]["scope"],
): AdvisoryFinding => {
  const label = extensionTypeSentenceLabels[desired.type];
  return {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "error",
    message: declaresWorkspaceSource(desired)
      ? `${label} '${desired.name}' declares a workspace source, but its authored canonical package is missing from the configured authored root.`
      : `${label} '${desired.name}' is desired, but its canonical content is missing from ${acquiredRootDisplayPath(scope)}.`,
    location: { file: settingsDisplayPath(scope) },
  };
};

export const configuredButNotInstalledRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured extensions have canonical content in the scope's canonical roots.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(observationsReportedBy(context, RULE_ID), (observed) =>
      observed.map(({ desired }) => findingFor(desired, context.subject.scope)),
    ),
};
