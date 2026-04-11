import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallPack } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry extension pack reference (@owner/packs/name, @owner/packs/name@version, or bare pack-name)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(
    Flag.withDescription("Reinstall even if the extension pack already exists"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstallPack({ source }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("packs install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Install configured extension packs, or install an extension pack and its extensions from a registry",
  ),
  Command.withExamples([
    {
      command: "axm packs install",
      description: "Install all configured extension packs",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Add a curated set of frontend extensions to your agents",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools@^2.0.0",
      description: "Pin to a specific version range",
    },
    {
      command: "axm packs install frontend-tools",
      description: "Install using your default owner",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools --preview",
      description: "See what would be installed before committing",
    },
  ]),
);
