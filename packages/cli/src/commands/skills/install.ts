import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleInstall } from "../../cli-commands/skills/install/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("GitHub shorthand (owner/repo), local path, or URL"),
    ),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    skill: Flag.string("skill").pipe(
      Flag.withDescription("Install only specified skill(s) by name"),
      Flag.atLeast(0),
    ),
    all: Flag.boolean("all").pipe(Flag.withDescription("Install all discovered skills")),
  },
  ({ source, scope, skill, all }) =>
    withCommandRuntime(
      handleInstall({ source, scope: resolveWorkspaceScope(scope), skills: skill, all }),
      {
        command: "skills install",
        workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
      },
    ),
).pipe(
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
