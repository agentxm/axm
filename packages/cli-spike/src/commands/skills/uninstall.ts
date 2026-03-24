// ---------------------------------------------------------------------------
// uninstall.ts — Stub command with full per-command flag coverage
//
// Stub commands define the CLI interface (args, flags, description) without
// real business logic. To convert this stub to a real command:
//   1. Add an output schema (Schema.Struct with _version: Schema.Literal(1))
//   2. Add a text renderer (pure function: data -> string)
//   3. Replace Console.log with the standard handler pattern:
//        const output = yield* Output;
//        const result = yield* doWork(config);
//        yield* output.result(schema, result, renderText);
//
// See list.ts (instant) and install.ts (long-running) for complete examples.
// ---------------------------------------------------------------------------
import * as Console from "effect/Console";
import { Argument, Command } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withRuntime } from "../../runtime.js";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    skill: Argument.string("skill").pipe(
      Argument.withDescription("Name of the skill to uninstall"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  (config) =>
    withRuntime(
      Console.log(
        `[stub] skills uninstall skill=${config.skill} yes=${config.yes} force=${config.force} preview=${config.preview}`,
      ),
      { command: "skills uninstall" },
    ),
).pipe(
  Command.withDescription("Uninstall a skill from agents"),
  Command.withExamples([
    { command: "axm-spike skills uninstall my-skill", description: "Uninstall a skill" },
    {
      command: "axm-spike skills uninstall my-skill --preview",
      description: "Preview what would be uninstalled",
    },
    {
      command: "axm-spike skills uninstall my-skill --yes",
      description: "Uninstall without confirmation",
    },
    {
      command: "axm-spike skills uninstall my-skill --preview --force --yes",
      description: "Show all per-command flags together",
    },
  ]),
);
