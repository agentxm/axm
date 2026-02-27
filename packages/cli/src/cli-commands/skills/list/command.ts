/**
 * List command yargs definition - wires handler to `axm skills list`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleList } from "./handler.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

export interface ListCommandArgs {
  scope: WorkspaceScope;
  agent: ReadonlyArray<string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const listCommand: CommandModule<{}, ListCommandArgs> = {
  command: "list",
  aliases: ["ls"],
  describe: "List installed skills",
  builder: (yargs) =>
    yargs
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Filter by agent(s)",
        default: [],
      })
      .example("$0 skills list", "List all installed skills")
      .example("$0 skills list --scope user", "List user-scope installed skills")
      .example("$0 skills list --agent claude-code", "List skills for a specific agent"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleList({
        agents: argv.agent,
      }),
      {
        flags: {
          nonInteractive: Option.some(true),
          yes: true,
          force: false,
          preview: false,
        },
        workspace: {
          scope,
          agents: Option.none(),
        },
      },
    );
  },
};
