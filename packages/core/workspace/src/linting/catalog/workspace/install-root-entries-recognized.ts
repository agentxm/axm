import * as Effect from "effect/Effect";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { workspaceDisplayPath } from "./display-paths.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/install-root-entries-recognized";

export const installRootEntriesRecognizedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Install root entries are installed packages or AXM staging.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.installRoot === undefined
      ? Effect.succeed(EMPTY_LINT_FINDINGS)
      : context.installRoot.pipe(
          Effect.map((inventory) =>
            inventory.unrecognized.map((entry) => {
              const display = workspaceDisplayPath(context.subject.root, entry.path);
              return {
                kind: "advisory",
                ruleId: RULE_ID,
                severity: "warning",
                message: `Unrecognized ${entry.entryKind} ${display} in the ${context.subject.scope}-scope install root is not an installed package or AXM staging.`,
                location: { file: display },
              } satisfies LintFinding;
            }),
          ),
        ),
};
