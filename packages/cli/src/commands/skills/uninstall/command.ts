/**
 * Uninstall command yargs definition - wires handler to `axm skills uninstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import type { CommandModule } from "yargs";
import { handleUninstall } from "./handler.js";

export interface UninstallArgs {
  skill: string;
  agent: string[];
  yes: boolean;
  "dry-run"?: boolean;
  json?: boolean;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the yargs convention for no parent args
export const uninstallCommand: CommandModule<{}, UninstallArgs> = {
  command: "uninstall <skill>",
  describe: "Uninstall a skill from agents",
  builder: (yargs) =>
    yargs
      .positional("skill", {
        type: "string",
        describe: "Name of the skill to uninstall",
        demandOption: true,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Uninstall only from specified agent(s)",
        default: [],
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompt",
        default: false,
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Show what would be uninstalled without making changes",
        default: false,
      })
      .option("json", {
        type: "boolean",
        describe: "Output the plan as JSON (useful with --dry-run)",
        default: false,
      })
      .example("$0 skills uninstall my-skill", "Uninstall a skill from all agents")
      .example(
        "$0 skills uninstall my-skill --agent claude",
        "Uninstall from a specific agent only",
      )
      .example("$0 skills uninstall my-skill --dry-run", "Preview what would be uninstalled")
      .example("$0 skills uninstall my-skill --yes", "Uninstall without confirmation prompt"),
  handler: async (argv) => {
    const program = handleUninstall({
      skill: argv.skill,
      agent: argv.agent,
      yes: argv.yes,
      dryRun: argv["dry-run"] ?? false,
      json: argv.json ?? false,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }),
      ),
      Effect.provide(Layer.merge(NodeContext.layer, Layer.empty)),
    );

    await Effect.runPromise(program);
  },
};
