import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags/index.js";
import { handleInstallPack } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry pack reference (@profile/packs/name, @profile/packs/name@version, or bare pack-name)",
    ),
  ),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleInstallPack({ source }, { yes, force, preview })), {
      command: "packs install",
    }),
).pipe(
  withArgvTracking(installConfig),
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
