import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { withRuntime } from "../../main.js";

export const defectCommand = Command.make("defect", {}, () =>
  withRuntime(Effect.die(new Error("Simulated defect telemetry failure")), {
    command: "telemetry defect",
  }),
).pipe(
  Command.withDescription("Emit an unhandled defect and report it to telemetry"),
  Command.withExamples([
    {
      command: "axm-spike telemetry defect",
      description: "Verify unhandled defect telemetry",
    },
  ]),
);
