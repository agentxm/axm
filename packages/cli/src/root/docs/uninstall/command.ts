import { Argument, Command, Flag } from "effect/unstable/cli";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleUninstallDocs } from "./handler.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the docs package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Uninstall without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Uninstall even if retained dependencies exist")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, yes, force, preview }) =>
    handleUninstallDocs({ name }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("docs uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a docs package"),
  Command.withExamples([
    {
      command: "axm docs uninstall workspace-baseline",
      description: "Uninstall a docs package by name",
    },
  ]),
);
