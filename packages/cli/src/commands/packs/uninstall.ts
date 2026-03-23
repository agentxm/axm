import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleUninstallPack } from "../../cli-commands/packs/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name or glob pattern of the pack to uninstall"),
    ),
  },
  ({ name }) =>
    withCommandRuntime(handleUninstallPack({ name }), {
      command: "packs uninstall",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
    }),
).pipe(
  Command.withDescription("Uninstall a pack"),
  Command.withExamples([
    {
      command: "axm packs uninstall my-pack",
      description: "Uninstall a pack and its orphaned extensions",
    },
    {
      command: "axm packs uninstall my-pack --preview",
      description: "Preview what would be uninstalled",
    },
    {
      command: "axm packs uninstall my-pack --yes",
      description: "Uninstall without confirmation prompt",
    },
    {
      command: "axm packs uninstall acme-*",
      description: "Uninstall all packs matching a pattern",
    },
  ]),
);
