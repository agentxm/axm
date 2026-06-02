import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleFilesPrune = Effect.fn("FilesPrune.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredFilesEntries();
  const locked = yield* ws.getLockedFiles();
  const stale = Object.keys(locked).filter((name) => configured[name] === undefined);
  for (const name of stale) {
    yield* ws.removeFilesLock(name);
  }
  yield* renderer.success(
    stale.length === 0
      ? "No files lock entries to prune"
      : `Pruned ${stale.length} files lock entr${stale.length === 1 ? "y" : "ies"}`,
  );
});

const pruneConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune project (default) or user-level files lock entries"),
  ),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ scope }) =>
  handleFilesPrune().pipe(withWorkspace(scope), withRuntime("files prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Prune stale files lock entries"),
  Command.withExamples([
    {
      command: "axm files prune",
      description: "Prune stale files lock entries",
    },
  ]),
);
