/**
 * Rename command yargs definition - wires handler to `axm skills rename`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
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
      .example("$0 skills rename old-name new-name", "Rename a skill")
      .example("$0 skills rename old-name new-name --preview", "Preview what would be renamed"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleRename({
        oldName: argv["old-name"],
        newName: argv["new-name"],
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills rename",
      },
    );
  },
};
