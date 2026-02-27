import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
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
  yes: boolean;
  force: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
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
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Override constraints that would cause failure",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display update plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
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
        yes: argv.yes,
        force: argv.force,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
      }),
      {
        workspace: {
          scope,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
          force: argv.force,
        },
      },
    );
  },
};
