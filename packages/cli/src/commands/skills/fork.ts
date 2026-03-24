import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleFork } from "../../cli-commands/skills/fork/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const forkCommand = Command.make(
  "fork",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Installed skill name, glob pattern, or source string (local path, github:owner/repo, etc.)",
      ),
    ),
    skill: Flag.string("skill").pipe(
      Flag.withDescription("Fork only specified skill(s) by name or glob pattern"),
      Flag.atLeast(0),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ source, skill, yes, force, preview }) =>
    withCommandRuntime(handleFork({ source, skills: [...skill] }), {
      command: "skills fork",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Fork a skill for customization"),
  Command.withExamples([
    {
      command: "axm skills fork my-skill",
      description: "Fork an installed skill to a managed extension",
    },
    {
      command: 'axm skills fork "effect-*"',
      description: "Fork all local skills matching the glob",
    },
    {
      command: "axm skills fork github:owner/repo",
      description: "Fork a skill from a GitHub repo",
    },
    {
      command: 'axm skills fork ./local/path --skill "effect-*"',
      description: "Fork matching skills from a local source",
    },
  ]),
);
