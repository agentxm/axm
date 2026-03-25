import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleInstall } from "../../cli-commands/skills/install/handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("GitHub shorthand (owner/repo), local path, or URL"),
  ),
  scope: scopeFlag,
  skill: Flag.string("skill").pipe(
    Flag.withDescription("Install only specified skill(s) by name"),
    Flag.atLeast(0),
  ),
  all: Flag.boolean("all").pipe(Flag.withDescription("Install all discovered skills")),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, skill, all, yes, force, preview }) =>
    withRuntime(
      withWorkspace(scope, handleInstall({ source, skills: skill, all }, { yes, force, preview })),
      { command: "skills install" },
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install skills from GitHub or local path"),
  Command.withExamples([
    { command: "axm skills install owner/repo", description: "Install skills interactively" },
    {
      command: "axm skills install owner/repo@v1.0.0",
      description: "Install from a specific tag, branch, or commit",
    },
    {
      command: "axm skills install ./path/to/skills",
      description: "Install from a local directory",
    },
    {
      command: "axm skills install owner/repo --all --yes",
      description: "Install all without prompts",
    },
    {
      command: "axm skills install owner/repo --skill pr-review",
      description: "Target a specific skill",
    },
  ]),
);
