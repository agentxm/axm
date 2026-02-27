import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
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
  global?: boolean;
  skill: ReadonlyArray<string>;
  yes: boolean;
  all: boolean;
  force: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
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
      .option("global", {
        type: "boolean",
        hidden: true,
        describe: "Deprecated alias for --scope user",
        default: false,
      })
      .option("skill", {
        type: "string",
        array: true,
        describe: "Install only specified skill(s) by name",
        default: [],
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("all", {
        type: "boolean",
        describe: "Install all discovered skills",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Auto-accept plan warnings without prompting",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display installation plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .group(["scope", "skill"], "Filtering:")
      .group(["yes", "all", "force", "preview"], "Behavior:")
      .example("$0 skills install owner/repo", "Install skills interactively")
      .example(
        "$0 skills install owner/repo@v1.0.0",
        "Install from a specific tag, branch, or commit",
      )
      .example("$0 skills install ./path/to/skills", "Install from a local directory")
      .example("$0 skills install owner/repo --all --yes", "Install all without prompts")
      .example("$0 skills install owner/repo --skill pr-review", "Target specific skill"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope, argv.global);
    const actionsLayer = Layer.provide(InstallSkillCommandWorkflowActionsLive, SkillManagerLive);
    await run(
      handleInstall({
        source: argv.source,
        scope,
        skills: argv.skill,
        yes: argv.yes,
        all: argv.all,
        force: argv.force,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
      }).pipe(Effect.provide(actionsLayer)),
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
