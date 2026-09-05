import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  ignoreReleaseAgeFlag,
  previewFlag,
  reinstallFlag,
  yesFlag,
} from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { handleInstallPack } from "./handler.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry pack reference (@owner/packs/name, @owner/packs/name@version, or bare pack-name)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall a pack that already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview, ignoreReleaseAge }) =>
    handleInstallPack({ source }, { yes, force, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("packs install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured packs from their sources, or install a pack and its extensions from a registry",
  ),
  Command.withExamples([
    {
      command: "axm packs install",
      description: "Reinstall all configured packs from their sources",
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
