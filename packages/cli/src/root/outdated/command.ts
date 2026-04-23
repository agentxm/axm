import { Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { installableExtensionTypes } from "@agentxm/client-core/unstable/extensions";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleOutdated } from "./handler.js";

const outdatedConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Check project (default) or user-level configuration"),
  ),
  type: Flag.choice("type", [...installableExtensionTypes]).pipe(
    Flag.withDescription("Only check a specific extension type"),
    Flag.optional,
  ),
} as const;

export const outdatedCommand = Command.make("outdated", outdatedConfig, ({ scope, type }) =>
  handleOutdated({ type }).pipe(withWorkspace(scope), withRuntime("outdated")),
).pipe(
  withArgvTracking(outdatedConfig),
  Command.withDescription("Show extensions with available updates"),
  Command.withExamples([
    { command: "axm outdated", description: "Check all extensions for updates" },
    { command: "axm outdated --type skill", description: "Check only skills for updates" },
    { command: "axm outdated --json", description: "Emit outdated extensions as JSON" },
    {
      command: "axm outdated --scope user",
      description: "Check user-level extensions for updates",
    },
  ]),
);
