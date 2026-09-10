import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { handleUninstall } from "./handler.js";

const uninstallConfig = {
  source: Argument.string("extension[@version]").pipe(
    Argument.withDescription("Registry FQN (@owner/<plural-type>/<name>[@version])"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would be removed without making changes"),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ source, scope, preview }) =>
    handleUninstall({ source, preview }).pipe(withWorkspace(scope), withRuntime("uninstall")),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
      command: "axm uninstall @acme/packs/frontend-tools --json",
      description: "Remove a pack and emit the result as JSON for scripts or CI",
    },
  ]),
);
