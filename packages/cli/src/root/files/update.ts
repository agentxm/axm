import { Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";

const updateConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply updates without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Update even if there are warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without updating")),
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ scope, yes, force, preview }) =>
    handleWorkspaceUpdate({
      command: "files.update",
      type: Option.some("files"),
      planName: "Update files",
      planDescription: Option.some("Update configured files packages"),
      flags: { yes, force, preview },
    }).pipe(withWorkspace(scope), withRuntime("files update")),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update configured files packages"),
  Command.withExamples([
    {
      command: "axm files update",
      description: "Update configured files packages",
    },
  ]),
);
