import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import { handleUninstall } from "./handler.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  skill: Argument.string("name").pipe(Argument.withDescription("Name of the skill to uninstall")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would be removed without making changes"),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ skill, scope, preview }) =>
    handleUninstall({ skill }, { preview }).pipe(
      withWorkspace(scope),
      withRuntime("skills uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Uninstall a skill from agents"),
  Command.withExamples([
    { command: "axm skills uninstall my-skill", description: "Remove a skill you no longer need" },
    {
      command: "axm skills uninstall my-skill --preview",
      description: "Check what would be removed first",
    },
  ]),
);
