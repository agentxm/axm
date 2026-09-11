/**
 * `axm knowledge uninstall`.
 */

import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import {
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { runUninstallCommand } from "../../shared/uninstall-command.js";
import { mutationFlags, scopeConfig } from "../flags.js";

export interface KnowledgeUninstallHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

export const handleKnowledgeUninstall = (args: KnowledgeUninstallHandlerArgs) =>
  runUninstallCommand({
    command: "knowledge.uninstall",
    preview: args.preview,
    liveName: "Uninstall knowledge",
    request: {
      type: Option.some("knowledge"),
      selector: args.name,
    },
    recoveryCommand: ["knowledge", "uninstall"],
    recoveryPositionals: [args.name],
    suggestions: () => [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
  });

const uninstallConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Configured Knowledge bundle name")),
  ...scopeConfig,
  ...mutationFlags,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, preview }) =>
    handleKnowledgeUninstall({ name, preview }).pipe(
      withWorkspace(scope),
      withRuntime("knowledge uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Uninstall a Knowledge bundle"),
  Command.withExamples([
    {
      command: "axm knowledge uninstall platform --preview",
      description: "Preview removing one Knowledge bundle",
    },
  ]),
);
