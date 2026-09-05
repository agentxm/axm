import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { handleWorkspaceInstall } from "../install/workspace-install-handler.js";

const updateConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Update project (default) or user-level packs")),
  yes: yesFlag.pipe(Flag.withDescription("Update without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without updating")),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ scope, yes, preview, ignoreReleaseAge }) =>
    handleWorkspaceInstall({
      command: "packs.update",
      type: Option.some("pack"),
      planName: "Update packs",
      planDescription: Option.some("Re-resolve configured pack constraints and dependencies"),
      flags: { yes, preview },
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("packs update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update enabled packs and reconcile their dependencies"),
  Command.withExamples([
    { command: "axm packs update --preview", description: "Preview available pack updates" },
    { command: "axm packs update --yes", description: "Update all enabled packs" },
  ]),
);
