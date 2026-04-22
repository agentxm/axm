import { Argument, Command, Flag } from "effect/unstable/cli";

import { yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handlePrune } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const pruneConfig = {
  patterns: Argument.string("patterns").pipe(
    Argument.withDescription("Glob patterns to filter which unmanaged skills to prune"),
    Argument.atLeast(0),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Remove artifacts without confirmation")),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ patterns, scope, yes }) =>
  handlePrune({ patterns }, { yes }).pipe(withWorkspace(scope), withRuntime("skills prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Remove unmanaged skill artifacts from the workspace"),
  Command.withExamples([
    {
      command: "axm skills prune",
      description: "Preview unmanaged skill artifacts that can be removed",
    },
    {
      command: "axm skills prune --yes",
      description: "Remove all unmanaged skill artifacts",
    },
    {
      command: "axm skills prune effect-*",
      description: "Preview unmanaged skills matching a glob pattern",
    },
    {
      command: "axm skills prune --json",
      description: "List prunable artifacts as JSON without removing",
    },
    {
      command: "axm skills prune --yes --json",
      description: "Remove artifacts and output what was removed as JSON",
    },
  ]),
);
