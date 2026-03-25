import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleDisable } from "../../cli-commands/skills/disable/handler.js";

export const disableCommand = Command.make(
  "disable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
    scope: scopeFlag,
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleDisable({ name })), {
      command: "skills disable",
      flags: { yes, force, preview },
    }),
).pipe(Command.withDescription("Disable a skill without uninstalling it"));
