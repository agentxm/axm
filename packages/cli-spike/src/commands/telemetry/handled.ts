import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { withRuntime } from "../../runtime.js";

export const handledCommand = Command.make("handled", {}, () =>
  withRuntime(
    Effect.fail(
      makeAppError({
        code: "SPIKE_HANDLED_ERROR",
        what: "Simulated handled telemetry failure",
        details: ["Raised by axm-spike to verify handled error reporting."],
        howToFix: "Run `axm-spike telemetry defect` to exercise defect telemetry.",
      }),
    ),
    { command: "telemetry handled" },
  ),
).pipe(
  Command.withDescription("Emit a handled AppError and report it to telemetry"),
  Command.withExamples([
    {
      command: "axm-spike telemetry handled",
      description: "Verify handled error telemetry",
    },
  ]),
);
