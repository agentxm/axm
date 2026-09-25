import * as Effect from "effect/Effect";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/deprecated-installed";

export const deprecatedInstalledRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Installed deprecated Registry extensions require an explicit migration decision.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.deprecatedInstalled === undefined
      ? Effect.succeed([])
      : Effect.map(context.deprecatedInstalled, (entries) =>
          entries.map((entry) => {
            const { fqn, deprecation, memberPacks } = entry;
            const replacement =
              deprecation.replacement?.status === "available"
                ? deprecation.replacement.fqn
                : deprecation.replacement === undefined
                  ? "none"
                  : "unavailable or concealed";
            const action =
              memberPacks.length > 0
                ? `Pack member of ${memberPacks.join(", ")}; ask its publisher to update the dependency. Inspect: axm packs show ${memberPacks[0]}.`
                : deprecation.reason === "superseded" &&
                    deprecation.replacement.status !== "available"
                  ? `Replacement unavailable; inspect: axm view ${fqn}.`
                  : deprecation.reason === "unmaintained" || deprecation.reason === "other"
                    ? `Choose a successor manually; inspect: axm view ${fqn}.`
                    : `Preview: axm migrate ${fqn} --dry-run. Apply: axm migrate ${fqn}.`;
            return {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "warning",
              message: `${fqn} is deprecated (${deprecation.reason}); replacement: ${replacement}. ${action}`,
              location: { file: settingsDisplayPath(context.subject.scope) },
            } satisfies LintFinding;
          }),
        ),
};
