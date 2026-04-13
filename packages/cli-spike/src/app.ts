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
import { CliOutput, Command, GlobalFlag } from "effect/unstable/cli";

import {
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { removeBuiltInFlag, runCliMain } from "@agentxm/client-core/unstable/cli-runtime";

import { makeSpikeFormatter } from "./formatter.js";
import { ROOT_COMMAND, VERSION } from "./runtime.js";
import { petsCommand } from "./root/pets/_pets.js";
import { telemetryCommand } from "./root/telemetry/_telemetry.js";
import { outputsCommand } from "./root/outputs/_outputs.js";
import { promptsCommand } from "./root/prompts/_prompts.js";

const globalFlags = [nonInteractiveFlag, verboseFlag, debugFlag, quietFlag, jsonFlag] as const;
const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

removeBuiltInFlag(GlobalFlag.Completions);
removeBuiltInFlag(GlobalFlag.LogLevel);

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
      const commandProgram = Command.runWith(rootCommand, { version: VERSION })(argv);

      return commandProgram.pipe(
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
