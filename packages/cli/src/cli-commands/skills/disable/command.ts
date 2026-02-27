/**
 * Disable command yargs definition - wires handler to `axm skills disable`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleDisable } from "./handler.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

export interface DisableCommandArgs {
  name: string;
  scope: WorkspaceScope;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const disableCommand: CommandModule<{}, DisableCommandArgs> = {
  command: "disable <name>",
  describe: "Disable a skill without uninstalling it",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the skill to disable",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .example("$0 skills disable my-skill", "Disable a skill without uninstalling")
      .example("$0 skills disable my-skill --preview", "Preview what would be disabled"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleDisable({
        name: argv.name,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
      },
    );
  },
};
