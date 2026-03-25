import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleInstallCommand } from "../../cli-commands/commands/install/handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry command reference (@profile/commands/name or bare name)"),
  ),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope }) =>
    withRuntime(withWorkspace(scope, handleInstallCommand({ source })), {
      command: "commands install",
    }),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install a command from a registry"),
  Command.withExamples([
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Install a command from the registry",
    },
    {
      command: "axm commands install my-cmd",
      description: "Install using the default profile",
    },
  ]),
);
