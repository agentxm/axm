import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags/index.js";
import { handleEnable } from "./handler.js";

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleEnable({ name, yes, force, preview })), {
      command: "skills enable",
    }),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a previously disabled skill"),
);
