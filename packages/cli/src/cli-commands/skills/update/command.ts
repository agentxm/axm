import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleUpdate } from "./handler.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

interface UpdateCommandArgs {
  source: string | undefined;
  scope: WorkspaceScope;
  agent: ReadonlyArray<string>;
  skill: ReadonlyArray<string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const updateCommand: CommandModule<{}, UpdateCommandArgs> = {
  command: "update [source]",
  describe: "Update installed skills to latest versions",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "Filter to skills from a specific source (owner/repo, path, or URL)",
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Update only skills for specified agent(s)",
        default: [],
      })
      .option("skill", {
        type: "string",
        array: true,
        describe: "Update only specified skill(s) by name or glob",
        default: [],
      })
      .example("$0 skills update", "Update all installed skills")
      .example("$0 skills update owner/repo", "Update skills from a specific source")
      .example("$0 skills update --skill pr-review", "Update a specific skill by name")
      .example("$0 skills update --yes", "Update all skills without confirmation"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleUpdate({
        source: Option.fromNullable(argv.source),
        scope,
        agents: argv.agent,
        skills: argv.skill,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills update",
      },
    );
  },
};
