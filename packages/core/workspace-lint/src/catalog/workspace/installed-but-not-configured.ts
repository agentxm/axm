import * as Effect from "effect/Effect";
import {
  extensionTypeSentenceLabels,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { InstalledPackageEntry } from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { workspaceDisplayPath } from "./display-paths.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/installed-but-not-configured";

const identityOf = (entry: InstalledPackageEntry): string =>
  entry.owner === undefined
    ? entry.name
    : `${entry.owner}/${toExtensionTypePlural(entry.type)}/${entry.name}`;

export const installedButNotConfiguredRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Installed packages in the install root are reached by desired state.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.installRoot === undefined
      ? Effect.succeed(EMPTY_LINT_FINDINGS)
      : context.installRoot.pipe(
          Effect.map((inventory) =>
            inventory.leftovers.map((entry) => {
              const display = workspaceDisplayPath(context.subject.root, entry.path);
              return {
                kind: "advisory",
                ruleId: RULE_ID,
                severity: "warning",
                message: `Installed ${extensionTypeSentenceLabels[entry.type]} '${identityOf(entry)}' is not configured in ${context.subject.scope} scope: canonical path ${display}, source directory ${entry.sourceDirectory ?? "none"}, ${entry.lockKey === undefined ? "no lock row" : "lock row present"}.`,
                location: { file: display },
              } satisfies LintFinding;
            }),
          ),
        ),
};
