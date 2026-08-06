import { Argument, Command, Flag } from "effect/unstable/cli";

import { yesFlag } from "@agentxm/client-core/unstable/cli-flags";
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
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ patterns, scope, yes }) =>
  handleRootPrune({ patterns }, { yes }).pipe(withWorkspace(scope), withRuntime("prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Clean up stale state whose AXM ownership can be proven"),
  Command.withExamples([
    {
      command: "axm prune",
      description: "Preview stale AXM-owned artifacts and state that can be removed",
    },
    {
      command: "axm prune --yes",
      description: "Remove all stale state whose AXM ownership can be proven",
    },
    {
      command: "axm prune effect-*",
      description: "Preview stale AXM-owned state matching a glob pattern",
    },
    {
      command: "axm prune --json",
      description: "List prunable artifacts as JSON without removing",
    },
    {
      command: "axm prune --yes --json",
      description: "Remove artifacts and output what was removed as JSON",
    },
  ]),
);
