import * as Effect from "effect/Effect";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { AgentOutputOwnershipProof } from "@agentxm/workspace-projection";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import { outputTypeLabel, userDisplayPath } from "./helpers/agent-scope-display.js";

const RULE_ID = "workspace/user-outputs-have-settings";

const proofText: Record<AgentOutputOwnershipProof, string> = {
  "storage-root-symlink": "links into AXM storage",
  "managed-banner": "carries an AXM ownership marker",
  "managed-mcp-entry": "is an AXM-managed MCP entry",
  "managed-hook-group": "is an AXM-managed hook group",
};

export const userOutputsHaveSettingsRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "AXM-owned user-scope agent outputs have readable user workspace settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.userScope === undefined
      ? Effect.succeed(EMPTY_LINT_FINDINGS)
      : context.userScope.pipe(
          Effect.map((user) =>
            user.settingsReadable
              ? EMPTY_LINT_FINDINGS
              : user.outputs.flatMap((output) => {
                  if (output.ownership !== "owned" || output.proof === undefined) return [];
                  const display = userDisplayPath(user.home, output.path);
                  return [
                    {
                      kind: "advisory",
                      ruleId: RULE_ID,
                      severity: "warning",
                      message: `User-scope agent ${outputTypeLabel(output.extensionType)} ${display} ${proofText[output.proof]}, but the user workspace has no readable settings at ${userDisplayPath(user.home, user.settingsPath)}.`,
                      location: { file: display },
                    } satisfies LintFinding,
                  ];
                }),
          ),
        ),
};
