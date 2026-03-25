import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleDisable } from "../../cli-commands/skills/disable/handler.js";

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope }) =>
    withRuntime(withWorkspace(scope, handleDisable({ name })), {
      command: "skills disable",
    }),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a skill without uninstalling it"),
);
