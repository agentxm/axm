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
import { CliOutput, Command } from "effect/unstable/cli";

import {
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
} from "@axm.sh/core/unstable/cli-flags";
import { runCliMain } from "@axm.sh/core/unstable/cli-runtime";

import { makeSpikeFormatter } from "./formatter.js";
import { ROOT_COMMAND, VERSION } from "./runtime.js";
import { petsCommand } from "./root/pets/command.js";
import { telemetryCommand } from "./root/telemetry/command.js";
import { outputsCommand } from "./root/outputs/command.js";
import { promptsCommand } from "./root/prompts/command.js";

const globalFlags = [nonInteractiveFlag, verboseFlag, debugFlag, quietFlag, jsonFlag] as const;
const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Effect v4 CLI spike — a pet store reference app for command and flag patterns.",
  ),
  Command.withExamples([
    { command: "axm-spike pets list", description: "List pets in the showroom" },
    {
      command: "axm-spike pets intake partner-feed",
      description: "Intake pets from a sample feed",
    },
    {
      command: "axm-spike telemetry handled",
      description: "Send a handled AppError to telemetry",
    },
  ]),
  Command.withSubcommands([petsCommand, telemetryCommand, promptsCommand, outputsCommand]),
  Command.withGlobalFlags(globalFlags),
);

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => {
      const isJson = hasExplicitJsonFlag(argv);

      return Command.runWith(rootCommand, { version: VERSION })(argv).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            FetchHttpClient.layer,
            CliOutput.layer(makeSpikeFormatter({ json: isJson })),
          ),
        ),
      );
    },
    { args },
  );
};
