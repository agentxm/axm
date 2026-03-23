import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handlePacksAdd } from "../../cli-commands/packs/add/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const addCommand = Command.make(
  "add",
  {
    pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
    extension: Argument.string("extension").pipe(
      Argument.withDescription("Extension name or glob pattern"),
    ),
  },
  ({ pack, extension }) =>
    withCommandRuntime(handlePacksAdd({ pack, extension }), {
      command: "packs add",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
    }),
).pipe(
  Command.withDescription("Add an extension to a pack manifest"),
  Command.withExamples([
    {
      command: "axm packs add frontend-tools @acme/skills/code-review",
      description: "Add a specific extension to a pack",
    },
    {
      command: 'axm packs add my-pack "effect-*"',
      description: "Add all matching extensions via glob",
    },
  ]),
);
