import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleHookPrune = Effect.fn("HookPrune.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredHookEntries();
  const locked = yield* ws.getLockedHooks();
  const stale = Object.keys(locked).filter((name) => configured[name] === undefined);
  for (const name of stale) {
    yield* ws.removeHookLock(name);
  }
  yield* renderer.success(
    stale.length === 0
      ? "No hooks lock entries to prune"
      : `Pruned ${stale.length} hooks lock entr${stale.length === 1 ? "y" : "ies"}`,
  );
});

const pruneConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune project (default) or user-level hooks lock entries"),
  ),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ scope }) =>
  handleHookPrune().pipe(withWorkspace(scope), withRuntime("hooks prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Prune stale hooks lock entries"),
  Command.withExamples([
    {
      command: "axm hooks prune",
      description: "Prune stale hooks lock entries",
    },
  ]),
);
