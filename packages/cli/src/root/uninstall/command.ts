import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleUninstall } from "./handler.js";

const uninstallConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry FQN (@owner/<plural-type>/<name>[@version])"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
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
  ({ source, scope, yes, force, preview }) =>
    handleUninstall({ source, yes, force, preview }).pipe(
      withWorkspace(scope),
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
      command: "axm uninstall @acme/hooks/session-audit@^1.2.0 --preview",
      description: "Preview uninstalling a hook; version is ignored for uninstall routing",
    },
    {
      command: "axm uninstall @acme/packs/frontend-tools --yes",
      description: "Remove a pack and skip confirmation in scripts or CI",
    },
  ]),
);
