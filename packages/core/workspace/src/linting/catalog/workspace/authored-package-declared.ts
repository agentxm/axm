import * as Effect from "effect/Effect";
import {
  extensionTypeSentenceLabels,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { settingsDisplayPath, workspaceDisplayPath } from "./display-paths.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/authored-package-declared";

export const authoredPackageDeclaredRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description:
    "Authored packages in standard authoring folders are declared in workspace settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.authoredPackages === undefined
      ? Effect.succeed(EMPTY_LINT_FINDINGS)
      : context.authoredPackages.pipe(
          Effect.map((packages) =>
            packages
              .filter((authored) => !authored.declared)
              .map((authored) => {
                const display = workspaceDisplayPath(context.subject.root, authored.path);
                return {
                  kind: "advisory",
                  ruleId: RULE_ID,
                  severity: "warning",
                  message: `Authored ${extensionTypeSentenceLabels[authored.type]} '${authored.owner}/${toExtensionTypePlural(authored.type)}/${authored.name}' version ${authored.version} at ${display} is not declared in ${settingsDisplayPath(context.subject.scope)}.`,
                  location: { file: display },
                } satisfies LintFinding;
              }),
          ),
        ),
};
