import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallCommand } from "./handler.js";
import { withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry command reference (@owner/commands/name or bare name)"),
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
const commandMeta = registryCommandMeta("commands install", { json: true });

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstallCommand({ source, yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(installConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Install a command from a registry"),
  Command.withExamples([
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Add a command from the registry",
    },
    {
      command: "axm commands install my-cmd",
      description: "Install using your default owner",
    },
    {
      command: "axm commands install @acme/commands/my-cmd --preview",
      description: "See what would be installed first",
    },
    { command: "", description: "See also: commands uninstall" },
  ]),
);
