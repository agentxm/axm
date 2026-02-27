/**
 * Enable command yargs definition - wires handler to `axm skills enable`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleEnable } from "./handler.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

export interface EnableCommandArgs {
  name: string;
  scope: WorkspaceScope;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const enableCommand: CommandModule<{}, EnableCommandArgs> = {
  command: "enable <name>",
  describe: "Enable a previously disabled skill",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the skill to enable",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 skills enable my-skill", "Enable a previously disabled skill")
      .example("$0 skills enable my-skill --preview", "Preview what would be enabled"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleEnable({
        name: argv.name,
        yes: argv.yes,
      }),
      {
        workspace: {
          scope,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
