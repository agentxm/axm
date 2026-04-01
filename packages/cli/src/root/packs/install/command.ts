import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallPack } from "./handler.js";
import { withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry pack reference (@profile/packs/name, @profile/packs/name@version, or bare pack-name)",
    ),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the pack already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("packs install", { json: true });

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstallPack({ source }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(installConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Install a pack and its extensions from a registry"),
  Command.withExamples([
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
      description: "Install using your default profile",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools --preview",
      description: "See what would be installed before committing",
    },
    {
      command: "",
      description: "See also: packs uninstall, packs unpack",
    },
  ]),
);
