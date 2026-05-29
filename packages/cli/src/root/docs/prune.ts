import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleDocsPrune = Effect.fn("DocsPrune.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredDocsEntries();
  const locked = yield* ws.getLockedDocs();
  const stale = Object.keys(locked).filter((name) => configured[name] === undefined);
  for (const name of stale) {
    yield* ws.removeDocsLock(name);
  }
  yield* renderer.success(
    stale.length === 0
      ? "No docs lock entries to prune"
      : `Pruned ${stale.length} docs lock entr${stale.length === 1 ? "y" : "ies"}`,
  );
});

const pruneConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune project (default) or user-level docs lock entries"),
  ),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ scope }) =>
  handleDocsPrune().pipe(withWorkspace(scope), withRuntime("docs prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Prune stale docs lock entries"),
  Command.withExamples([
    {
      command: "axm docs prune",
      description: "Prune stale docs lock entries",
    },
  ]),
);
