import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { classifyNativeOutputCollisions } from "@agentxm/workspace-kernel/projection";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { workspaceDisplayPath } from "@agentxm/workspace-kernel/workspace-state";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import { outputTypeLabel, userDisplayPath } from "./helpers/agent-scope-display.js";

const RULE_ID = "workspace/project-outputs-not-shadowed";

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
      const settings = yield* context.workspace.state.settings.pipe(Effect.result);
      if (Result.isFailure(settings) || Option.isNone(settings.success)) return EMPTY_LINT_FINDINGS;
      const concerns = classifyNativeOutputCollisions(
        project.outputs,
        user.outputs,
        new Set(settings.success.value.agents ?? []),
      );
      const findings: Array<LintFinding> = [];
      for (const concern of concerns) {
        if (concern.kind !== "collision") continue;
        const display = workspaceDisplayPath(context.subject.root, concern.path);
        const label = outputTypeLabel(concern.extensionType);
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message: `Project ${label} '${concern.entryName}' at ${display} has a same-named user-scope ${label} at ${userDisplayPath(user.home, concern.otherPath)} for ${concern.agentIds.join(", ")}; both locations are read by these configured agents.`,
          location: { file: display },
        });
      }
      return findings;
    });
  },
};
