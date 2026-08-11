import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { handleRootPrune } from "./handler.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

const pruneConfig = {
  patterns: Argument.string("patterns").pipe(
    Argument.withDescription("Glob patterns to filter which stale AXM-owned state to prune"),
    Argument.atLeast(0),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Remove artifacts without confirmation")),
  preview: previewFlag,
} as const;

export const pruneCommand = Command.make(
  "prune",
  pruneConfig,
  ({ patterns, scope, yes, preview }) =>
    handleRootPrune({ patterns }, { yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("prune"),
    ),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Clean up stale state whose AXM ownership can be proven"),
  Command.withExamples([
    {
      command: "axm prune",
      description: "Remove stale state whose AXM ownership can be proven",
    },
    {
      command: "axm prune --preview",
      description: "Preview stale AXM-owned artifacts without removing them",
    },
    {
      command: "axm prune effect-*",
      description: "Remove matching stale AXM-owned state",
    },
    {
      command: "axm prune --json",
      description: "Remove prunable artifacts and report JSON",
    },
    {
      command: "axm prune --preview --json",
      description: "Preview prunable artifacts as JSON without removing",
    },
  ]),
);
