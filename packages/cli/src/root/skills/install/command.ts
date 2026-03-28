import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstall } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry reference (@profile/skills/name), GitHub shorthand (owner/repo), local path, or URL",
    ),
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
  Command.withDescription("Install skills from a registry, GitHub, or local path"),
  Command.withExamples([
    {
      command: "axm skills install @acme/skills/code-review",
      description: "Install a skill from the registry",
    },
    {
      command: "axm skills install @acme/skills/code-review@^1.0.0",
      description: "Install a specific version from the registry",
    },
    {
      command: "axm skills install owner/repo",
      description: "Install skills from a GitHub repository",
    },
    {
      command: "axm skills install ./path/to/skills",
      description: "Install from a local directory",
    },
    {
      command: "axm skills install owner/repo --all --yes",
      description: "Install all from GitHub without prompts",
    },
  ]),
);
