import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleEnable } from "../../cli-commands/skills/enable/handler.js";

export const enableCommand = Command.make(
  "enable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
    scope: scopeFlag,
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleEnable({ name })), {
      command: "skills enable",
      flags: { yes, force, preview },
    }),
).pipe(Command.withDescription("Enable a previously disabled skill"));
