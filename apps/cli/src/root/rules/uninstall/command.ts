import { Argument, Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleUninstallRule } from "./handler.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the rule")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would be removed without making changes"),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, preview }) =>
    handleUninstallRule({ name }, { preview }).pipe(
      withWorkspace(scope),
      withRuntime("rules uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Uninstall a rule"),
  Command.withExamples([
    {
      command: "axm rules uninstall commit-style",
      description: "Uninstall a rule by name",
    },
  ]),
);
