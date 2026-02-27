/**
 * Rename command yargs definition - wires handler to `axm skills rename`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleRename } from "./handler.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

export interface RenameCommandArgs {
  "old-name": string;
  "new-name": string;
  scope: WorkspaceScope;
  global?: boolean;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const renameCommand: CommandModule<{}, RenameCommandArgs> = {
  command: "rename <old-name> <new-name>",
  describe: "Rename a skill",
  builder: (yargs) =>
    yargs
      .positional("old-name", {
        type: "string",
        describe: "Current name of the skill",
        demandOption: true,
      })
      .positional("new-name", {
        type: "string",
        describe: "New name for the skill",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("global", {
        type: "boolean",
        hidden: true,
        describe: "Deprecated alias for --scope user",
        default: false,
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
      .example("$0 skills rename old-name new-name", "Rename a skill")
      .example("$0 skills rename old-name new-name --preview", "Preview what would be renamed"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope, argv.global);
    await run(
      handleRename({
        oldName: argv["old-name"],
        newName: argv["new-name"],
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
