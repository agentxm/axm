import { Command } from "effect/unstable/cli";

import { defectCommand } from "./defect.js";
import { handledCommand } from "./handled.js";

export const telemetryCommand = Command.make("telemetry").pipe(
  Command.withDescription("Exercise telemetry error reporting paths"),
  Command.withExamples([
    {
      command: "axm-spike telemetry handled",
      description: "Send a handled AppError to telemetry",
    },
    {
      command: "axm-spike telemetry defect",
      description: "Send an unhandled defect to telemetry",
    },
  ]),
  Command.withSubcommands([handledCommand, defectCommand]),
);
