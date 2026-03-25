import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleFork } from "../../cli-commands/skills/fork/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

const forkConfig = {
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
} as const;

export const forkCommand = Command.make(
  "fork",
  forkConfig,
  ({ source, skill, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handleFork({ source, skills: [...skill], yes, force, preview }),
      ),
      { command: "skills fork" },
    ),
).pipe(
  withArgvTracking(forkConfig),
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
