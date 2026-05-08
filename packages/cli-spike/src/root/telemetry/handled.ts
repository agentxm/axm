import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";

const handledConfig = {} as const;

const handleHandledTelemetry = Effect.fail(
  makeAppError({
    code: "SPIKE_HANDLED_ERROR",
    category: "internal",
    what: "Simulated handled telemetry failure",
    breadcrumbs: [
      {
        task: "Recover",
        description: "Run `axm-spike telemetry defect` to exercise defect telemetry.",
      },
    ],
  }),
);

export const handledCommand = Command.make("handled", handledConfig, () =>
  handleHandledTelemetry.pipe(withRuntime("telemetry handled")),
).pipe(
  withArgvTracking(handledConfig),
  Command.withDescription("Emit a handled AppError and report it to telemetry"),
  Command.withExamples([
    {
      command: "axm-spike telemetry handled",
      description: "Verify handled error telemetry",
    },
  ]),
);
