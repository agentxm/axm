import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallCommand } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry command reference, bare name, or source locator"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the command already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstallCommand({ source, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("commands install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured commands, or install commands from a registry or source locator",
  ),
  Command.withExamples([
    {
      command: "axm commands install",
      description: "Reinstall all configured commands from their sources",
    },
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Add a command from the registry",
    },
    {
      command: "axm commands install my-cmd",
      description: "Install using your default owner",
    },
    {
      command: "axm commands install github:acme/agent-extensions//commands@v1.0.0",
      description: "Install commands discovered from a locator",
    },
    {
      command: "axm commands install @acme/commands/my-cmd --preview",
      description: "See what would be installed first",
    },
  ]),
);
