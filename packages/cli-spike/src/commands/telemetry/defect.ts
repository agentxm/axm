import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";

const defectConfig = {} as const;

export const defectCommand = Command.make("defect", defectConfig, () =>
  withRuntime(Effect.die(new Error("Simulated defect telemetry failure")), {
    command: "telemetry defect",
  }),
).pipe(
  withArgvTracking(defectConfig),
  Command.withDescription("Emit an unhandled defect and report it to telemetry"),
  Command.withExamples([
    {
      command: "axm-spike telemetry defect",
      description: "Verify unhandled defect telemetry",
    },
  ]),
);
