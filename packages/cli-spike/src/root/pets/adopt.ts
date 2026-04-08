// ---------------------------------------------------------------------------
// adopt.ts — Stub command with full per-command flag coverage
//
// Stub commands define the CLI interface (args, flags, description) without
// real business logic. To convert this stub to a real command:
//   1. Replace Console.log with the standard handler pattern:
//        const renderer = yield* CliRenderer;
//        const result = yield* doWork(config);
//        yield* renderer.success(formatResult(result));
//
// See list.ts (instant) and intake.ts (long-running) for complete examples.
// ---------------------------------------------------------------------------
import * as Console from "effect/Console";
import { Argument, Command } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";

const adoptConfig = {
  pet: Argument.string("pet").pipe(Argument.withDescription("Name of the pet to adopt out")),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const adoptCommand = Command.make("adopt", adoptConfig, (config) =>
  withRuntime(
    Console.log(
      `[stub] pets adopt pet=${config.pet} yes=${config.yes} force=${config.force} preview=${config.preview}`,
    ),
    { command: "pets adopt" },
  ),
).pipe(
  withArgvTracking(adoptConfig),
  Command.withDescription("Adopt out a sample pet"),
  Command.withExamples([
    { command: "axm-spike pets adopt Mochi", description: "Adopt out a pet" },
    {
      command: "axm-spike pets adopt Mochi --preview",
      description: "Preview the adoption action",
    },
    {
      command: "axm-spike pets adopt Mochi --yes",
      description: "Adopt without confirmation",
    },
    {
      command: "axm-spike pets adopt Mochi --preview --force --yes",
      description: "Show all per-command flags together",
    },
  ]),
);
