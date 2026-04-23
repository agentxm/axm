import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleUninstall } from "./handler.js";

const uninstallConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry FQN (@owner/<plural-type>/<name>[@version])"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the uninstall plan")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if the extension is referenced by other extensions"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ source, yes, force, preview }) =>
    handleUninstall({ source, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Remove an extension from the workspace"),
  Command.withExamples([
    {
      command: "axm uninstall @acme/skills/code-review",
      description: "Remove an installed skill by fully qualified registry name",
    },
    {
      command: "axm uninstall @acme/commands/release-notes@^1.2.0 --preview",
      description: "Preview uninstalling a command; version is ignored for uninstall routing",
    },
    {
      command: "axm uninstall @acme/packs/frontend-tools --yes",
      description: "Remove a pack and skip confirmation in scripts or CI",
    },
  ]),
);
