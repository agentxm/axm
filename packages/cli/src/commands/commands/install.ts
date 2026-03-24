import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, scopeFlag, yesFlag } from "../../cli-flags/index.js";
import { handleInstallCommand } from "../../cli-commands/commands/install/handler.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("Registry command reference (@profile/commands/name or bare name)"),
    ),
    scope: scopeFlag,
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ source, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleInstallCommand({ source })), {
      command: "commands install",
      flags: { yes, force, preview },
    }),
).pipe(
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
