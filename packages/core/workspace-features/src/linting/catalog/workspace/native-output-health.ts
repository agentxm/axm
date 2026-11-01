import * as Effect from "effect/Effect";
import type { AdvisoryRule } from "@agentxm/extension-content/lint";
import { classifyNativeOutputHealth } from "@agentxm/workspace-kernel/projection";
import { workspaceDisplayPath } from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";

const health = (context: WorkspaceRuleContext) =>
  Effect.gen(function* () {
    const project = context.agentOutputs === undefined ? undefined : yield* context.agentOutputs;
    const user = context.userScope === undefined ? undefined : yield* context.userScope;
    return classifyNativeOutputHealth(
      [...(project?.outputs ?? []), ...(user?.outputs ?? [])],
      [...(project?.diagnostics ?? []), ...(user?.diagnostics ?? [])],
    );
  });

export const nativeOutputLinksResolveRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: "workspace/native-output-links-resolve",
  description: "Native skill and subagent links have existing targets.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    health(context).pipe(
      Effect.map((concerns) =>
        concerns.flatMap((concern) => {
          if (concern.kind !== "broken-link") return [];
          const file = workspaceDisplayPath(context.subject.root, concern.path);
          return [
            {
              kind: "advisory" as const,
              ruleId: "workspace/native-output-links-resolve",
              severity: "warning" as const,
              message: `Native output link at ${file} has missing target '${concern.target}'.`,
              location: { file },
            },
          ];
        }),
      ),
    ),
};

export const nativeOutputsReadableRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: "workspace/native-outputs-readable",
  description: "Native output entries and Hook and MCP configuration can be inspected.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    health(context).pipe(
      Effect.map((concerns) =>
        concerns.flatMap((concern) => {
          if (concern.kind !== "unreadable") return [];
          const file = workspaceDisplayPath(context.subject.root, concern.path);
          return [
            {
              kind: "advisory" as const,
              ruleId: "workspace/native-outputs-readable",
              severity: "warning" as const,
              message: `Native output at ${file} could not be inspected (${concern.reason}).`,
              location: { file },
            },
          ];
        }),
      ),
    ),
};
