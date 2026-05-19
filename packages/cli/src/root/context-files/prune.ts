import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleContextFilesPrune = Effect.fn("ContextFilesPrune.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredFileEntries();
  const locked = yield* ws.getLockedFiles();
  const stale = Object.keys(locked).filter((name) => configured[name] === undefined);
  for (const name of stale) {
    yield* ws.removeFileLock(name);
  }
  yield* renderer.success(
    stale.length === 0
      ? "No file lock entries to prune"
      : `Pruned ${stale.length} file lock entr${stale.length === 1 ? "y" : "ies"}`,
  );
});

const pruneConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune project (default) or user-level file lock entries"),
  ),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ scope }) =>
  handleContextFilesPrune().pipe(withWorkspace(scope), withRuntime("context-files prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Prune stale context files lock entries"),
  Command.withExamples([
    {
      command: "axm context-files prune",
      description: "Prune stale context files lock entries",
    },
  ]),
);
