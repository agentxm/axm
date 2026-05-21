import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { renderWorkspaceGeneratorRegions } from "@agentxm/client-core/unstable/context";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

const regionLabel = (count: number): string => (count === 1 ? "region" : "regions");

const fileLabel = (count: number): string => (count === 1 ? "file" : "files");

export const runContextWorkspaceGeneratorPhase = Effect.fn(
  "Context.runContextWorkspaceGeneratorPhase",
)(function* (args: { readonly dryRun: boolean }) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const result = yield* renderWorkspaceGeneratorRegions({
    workspaceRoot: ws.baseDir,
    dryRun: args.dryRun,
  });

  if (result.renderedRegions === 0) return result;

  const message = `${args.dryRun ? "Would render" : "Rendered"} ${result.renderedRegions} workspace generator ${regionLabel(result.renderedRegions)} across ${result.changedFiles} ${fileLabel(result.changedFiles)}`;
  if (args.dryRun) {
    yield* renderer.info(message);
  } else {
    yield* renderer.success(message);
  }
  return result;
});
