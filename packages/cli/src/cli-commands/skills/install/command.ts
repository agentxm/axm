import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleInstall } from "./handler.js";
import { InstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

interface InstallCommandArgs {
  source: string;
  scope: WorkspaceScope;
  skill: ReadonlyArray<string>;
  all: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installCommand: CommandModule<{}, InstallCommandArgs> = {
  command: "install <source>",
  describe: "Install skills from GitHub or local path",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "GitHub shorthand (owner/repo), local path, or URL",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("skill", {
        type: "string",
        array: true,
        describe: "Install only specified skill(s) by name",
        default: [],
      })
      .option("all", {
        type: "boolean",
        describe: "Install all discovered skills",
        default: false,
      })
      .group(["scope", "skill"], "Filtering:")
      .example("$0 skills install owner/repo", "Install skills interactively")
      .example(
        "$0 skills install owner/repo@v1.0.0",
        "Install from a specific tag, branch, or commit",
      )
      .example("$0 skills install ./path/to/skills", "Install from a local directory")
      .example("$0 skills install owner/repo --all --yes", "Install all without prompts")
      .example("$0 skills install owner/repo --skill pr-review", "Target specific skill"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    const actionsLayer = Layer.provide(InstallSkillCommandWorkflowActionsLive, SkillManagerLive);
    await run(
      handleInstall({
        source: argv.source,
        scope,
        skills: argv.skill,
        all: argv.all,
      }).pipe(Effect.provide(actionsLayer)),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills install",
      },
    );
  },
};
