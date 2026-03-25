import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { handlePacksAdd } from "../../cli-commands/packs/add/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

export const addCommand = Command.make(
  "add",
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
    withRuntime(withWorkspace(DEFAULT_WORKSPACE_SCOPE, handlePacksAdd({ pack, extension })), {
      command: "packs add",
      flags: { yes, force, preview },
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
