/**
 * CLI application module.
 *
 * Owns root command composition and the top-level run() function.
 * Runtime/service provisioning stays in runtime.ts.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { Command } from "effect/unstable/cli";

import { nonInteractiveFlag, outputFormatFlag } from "@axm.sh/core/unstable/cli-flags";
import { runCliMain } from "@axm.sh/core/unstable/cli-runtime";

import { ROOT_COMMAND, VERSION } from "./runtime.js";
import { skillsCommand } from "./commands/skills/command.js";
import { telemetryCommand } from "./commands/telemetry/command.js";

const globalFlags = [nonInteractiveFlag, outputFormatFlag] as const;

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription("Effect v4 CLI spike — proving out idiomatic command/flag patterns."),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List installed skills" },
    { command: "axm-spike skills install owner/repo", description: "Install skills from GitHub" },
    {
      command: "axm-spike telemetry handled",
      description: "Send a handled AppError to telemetry",
    },
  ]),
  Command.withSubcommands([skillsCommand, telemetryCommand]),
  Command.withGlobalFlags(globalFlags),
);

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) =>
      Command.runWith(rootCommand, { version: VERSION })(argv).pipe(
        Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
      ),
    { args },
  );
};
