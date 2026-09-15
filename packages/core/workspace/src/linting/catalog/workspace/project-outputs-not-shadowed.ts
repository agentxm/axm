import * as Effect from "effect/Effect";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { workspaceDisplayPath } from "./display-paths.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import { agentsDisplay, outputTypeLabel, userDisplayPath } from "./helpers/agent-scope-display.js";

const RULE_ID = "workspace/project-outputs-not-shadowed";

/** Types whose agent outputs are named directory or file entries an agent loads by name. */
const NAMED_OUTPUT_TYPES = new Set(["skill", "subagent"]);

export const projectOutputsNotShadowedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Project agent outputs have no same-named user-scope output for the same agent.",
  kind: "advisory",
  severity: "warning",
  check: (context) => {
    const { agentOutputs, userScope } = context;
    if (
      context.subject.scope !== "project" ||
      agentOutputs === undefined ||
      userScope === undefined
    )
      return Effect.succeed(EMPTY_LINT_FINDINGS);
    return Effect.gen(function* () {
      const project = yield* agentOutputs;
      const user = yield* userScope;
      const findings: Array<LintFinding> = [];
      for (const output of project.outputs) {
        if (!NAMED_OUTPUT_TYPES.has(output.extensionType)) continue;
        for (const other of user.outputs) {
          if (
            other.extensionType !== output.extensionType ||
            other.entryName !== output.entryName ||
            other.containerPath === output.containerPath
          )
            continue;
          const shared = output.claimantAgentIds.filter((id) =>
            other.claimantAgentIds.includes(id),
          );
          if (shared.length === 0) continue;
          const display = workspaceDisplayPath(context.subject.root, output.path);
          const label = outputTypeLabel(output.extensionType);
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "warning",
            message: `Project ${label} '${output.entryName}' at ${display} has a same-named user-scope ${label} at ${userDisplayPath(user.home, other.path)} for ${agentsDisplay(shared)}; the agent decides which one it loads.`,
            location: { file: display },
          });
        }
      }
      return findings;
    });
  },
};
