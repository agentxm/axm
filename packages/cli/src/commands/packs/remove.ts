import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handlePacksRemove } from "../../cli-commands/packs/remove/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

const removeConfig = {
  pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const removeCommand = Command.make(
  "remove",
  removeConfig,
  ({ pack, extension, yes, force, preview }) =>
    withRuntime(withWorkspace(DEFAULT_WORKSPACE_SCOPE, handlePacksRemove({ pack, extension })), {
      command: "packs remove",
      flags: { yes, force, preview },
    }),
).pipe(
  withArgvTracking(removeConfig),
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
