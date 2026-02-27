/**
 * Uninstall command yargs definition - wires handler to `axm skills uninstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUninstall } from "./handler.js";
import { UninstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";

export interface UninstallCommandArgs {
  skill: string;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const uninstallCommand: CommandModule<{}, UninstallCommandArgs> = {
  command: "uninstall <skill>",
  describe: "Uninstall a skill from agents",
  builder: (yargs) =>
    yargs
      .positional("skill", {
        type: "string",
        describe: "Name of the skill to uninstall",
        demandOption: true,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display uninstall plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 skills uninstall my-skill", "Uninstall a skill")
      .example("$0 skills uninstall my-skill --preview", "Preview what would be uninstalled")
      .example("$0 skills uninstall my-skill --yes", "Uninstall without confirmation prompt"),
  handler: async (argv) => {
    const actionsLayer = Layer.provide(UninstallSkillCommandWorkflowActionsLive, SkillManagerLive);
    await run(
      handleUninstall({
        skill: argv.skill,
        yes: argv.yes,
      }).pipe(Effect.provide(actionsLayer)),
      {
        workspace: {
          scope: "project",
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
