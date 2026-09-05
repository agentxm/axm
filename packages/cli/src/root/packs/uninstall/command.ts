import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { handleUninstallPack } from "./handler.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name or glob pattern of the pack to uninstall"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, yes, preview }) =>
    handleUninstallPack({ name }, { yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("packs uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a pack"),
  Command.withExamples([
    {
      command: "axm packs uninstall my-pack",
      description: "Remove a pack and its orphaned extensions",
    },
    {
      command: "axm packs uninstall my-pack --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm packs uninstall my-pack --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
    {
      command: "axm packs uninstall acme-*",
      description: "Remove all packs matching a pattern",
    },
  ]),
);
