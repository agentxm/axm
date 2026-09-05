import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { handleWorkspaceInstall } from "../install/workspace-install-handler.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export interface PacksUpdateHandlerArgs {
  readonly preview: boolean;
}

export const handlePacksUpdate = (args: PacksUpdateHandlerArgs) =>
  handleWorkspaceInstall({
    command: "packs.update",
    type: Option.some("pack"),
    planName: "Update packs",
    planDescription: Option.some("Re-resolve configured pack constraints and dependencies"),
    flags: { preview: args.preview },
  });

const updateConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Update project (default) or user-level packs")),
  preview: previewCapabilityFlag("Show what would change without updating"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ scope, preview, ignoreReleaseAge }) =>
    handlePacksUpdate({ preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("packs update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Update enabled packs and reconcile their dependencies"),
  Command.withExamples([
    { command: "axm packs update --preview", description: "Preview available pack updates" },
    { command: "axm packs update", description: "Update all enabled packs" },
  ]),
);
