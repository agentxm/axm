import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag, reinstallFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { handleInstallPack } from "./handler.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";
import { installSourceArgumentDescription } from "@agentxm/workspace/lifecycle";

const installConfig = {
  source: Argument.String("source").pipe(
    Argument.withDescription(installSourceArgumentDescription("pack")),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall a pack that already exists")),
  preview: previewCapabilityFlag("Show what would be installed without making changes"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, force, preview, ignoreReleaseAge }) =>
    handleInstallPack({ source }, { force, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("packs install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription(
    "Reinstall configured packs from their sources, or install a pack and its extensions from a source",
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
      command: "axm packs install github:acme/packs",
      description: "Install a pack from a Git repository",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools --preview",
      description: "See what would be installed before committing",
    },
  ]),
);
