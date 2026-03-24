import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handlePacksRemove } from "../../cli-commands/packs/remove/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const removeCommand = Command.make(
  "remove",
  {
    pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
    extension: Argument.string("extension").pipe(
      Argument.withDescription("Extension name or glob pattern"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ pack, extension, yes, force, preview }) =>
    withRuntime(handlePacksRemove({ pack, extension }), {
      command: "packs remove",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Remove an extension from a pack manifest"),
  Command.withExamples([
    {
      command: "axm packs remove frontend-tools @acme/skills/code-review",
      description: "Remove a specific extension from a pack",
    },
    {
      command: 'axm packs remove my-pack "@acme/effect-*"',
      description: "Remove all matching extensions via glob",
    },
  ]),
);
