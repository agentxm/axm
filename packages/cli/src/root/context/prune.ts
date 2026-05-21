import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleContextPrune = Effect.fn("ContextPrune.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredContextEntries();
  const locked = yield* ws.getLockedContext();
  const stale = Object.keys(locked).filter((name) => configured[name] === undefined);
  for (const name of stale) {
    yield* ws.removeContextLock(name);
  }
  yield* renderer.success(
    stale.length === 0
      ? "No context lock entries to prune"
      : `Pruned ${stale.length} context lock entr${stale.length === 1 ? "y" : "ies"}`,
  );
});

const pruneConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune project (default) or user-level context lock entries"),
  ),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ scope }) =>
  handleContextPrune().pipe(withWorkspace(scope), withRuntime("context prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Prune stale context lock entries"),
  Command.withExamples([
    {
      command: "axm context prune",
      description: "Prune stale context lock entries",
    },
  ]),
);
