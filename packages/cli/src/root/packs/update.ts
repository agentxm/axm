import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleWorkspaceInstall } from "../install/workspace-install-handler.js";

const updateConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Update project (default) or user-level packs")),
  yes: yesFlag.pipe(Flag.withDescription("Update without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without updating")),
} as const;

export const updateCommand = Command.make("update", updateConfig, ({ scope, yes, preview }) =>
  handleWorkspaceInstall({
    command: "packs.update",
    type: Option.some("pack"),
    planName: "Update packs",
    planDescription: Option.some("Re-resolve configured pack constraints and dependencies"),
    flags: { yes, preview },
  }).pipe(withWorkspace(scope), withRuntime("packs update")),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update enabled packs and reconcile their dependencies"),
  Command.withExamples([
    { command: "axm packs update --preview", description: "Preview available pack updates" },
    { command: "axm packs update --yes", description: "Update all enabled packs" },
  ]),
);
