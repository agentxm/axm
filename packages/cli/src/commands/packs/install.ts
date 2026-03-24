import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, scopeFlag, yesFlag } from "../../cli-flags/index.js";
import { handleInstallPack } from "../../cli-commands/packs/install/handler.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Registry pack reference (@profile/packs/name, @profile/packs/name@version, or bare pack-name)",
      ),
    ),
    scope: scopeFlag,
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ source, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleInstallPack({ source })), {
      command: "packs install",
      flags: { yes, force, preview },
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
      description: "Install using the default profile",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools --preview",
      description: "See what would be installed",
    },
  ]),
);
