import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleInstallPack } from "../../cli-commands/packs/install/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Registry pack reference (@namespace/packs/name, @namespace/packs/name@version, or bare pack-name)",
      ),
    ),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
  },
  ({ source, scope }) =>
    withCommandRuntime(handleInstallPack({ source, scope: resolveWorkspaceScope(scope) }), {
      command: "packs install",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
    }),
).pipe(
  Command.withDescription("Install a pack and its extensions from a registry"),
  Command.withExamples([
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Install a pack and all referenced extensions",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools@^2.0.0",
      description: "Install a specific version range",
    },
    {
      command: "axm packs install frontend-tools",
      description: "Install using the default namespace",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools --preview",
      description: "See what would be installed",
    },
  ]),
);
