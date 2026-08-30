import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { JobStepResult, Plan } from "@agentxm/extension-management/unstable/plan";

export const inlineMcpNotApplicablePlan = (
  name: string,
  operation: "install" | "update",
): Plan => ({
  _tag: "Plan",
  name: `Skip inline MCP server ${operation}`,
  description: Option.some(`${name} is authored directly in workspace configuration`),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          key: `not-applicable:mcp-server:${name}`,
          readiness: "ready",
          label: name,
          run: Effect.succeed({
            result: "success",
            disposition: "skipped",
            message: `${name} is inline workspace configuration; run axm sync to reconcile it`,
          } satisfies JobStepResult),
        },
      ],
    },
  ],
});
