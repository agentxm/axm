import { Argument, Command, Flag } from "effect/unstable/cli";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleUninstallHook } from "./handler.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hooks package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Uninstall without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, yes, preview }) =>
    handleUninstallHook({ name }, { yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("hooks uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a hooks package"),
  Command.withExamples([
    {
      command: "axm hooks uninstall workspace-baseline",
      description: "Uninstall a hooks package by name",
    },
  ]),
);
