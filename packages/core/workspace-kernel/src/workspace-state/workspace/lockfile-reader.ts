import type { LockfileReaderService } from "./read-contracts.js";
export type { LockfileReaderService } from "./read-contracts.js";
/**
 * Lockfile reader: the selected scope's accepted resolutions — the lockfile
 * health probe, the per-type entry maps, one entry by lock key, and the
 * accepted resolution a desired extension's type and name resolve to.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { DesiredStateGraph } from "./desired-state-graph.js";
import { acceptedRowKey } from "./accepted-reachability.js";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { lockEntries } from "./entry-accessors.js";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";

export class LockfileReader extends ServiceMap.Service<LockfileReader, LockfileReaderService>()(
  "@agentxm/workspace-kernel/workspace-state/LockfileReader",
) {}

export const makeLockfileReader = (
  documents: WorkspaceDocumentsService,
  desiredState: DesiredStateReaderService,
  acceptedGraph?: DesiredStateGraph,
): LockfileReaderService => {
  const lockfile = documents.acceptedResolutions;
  const acceptedConnections =
    acceptedGraph === undefined
      ? undefined
      : new Map(
          acceptedGraph.nodes
            .filter((node) => node.type === "mcp-server")
            .map((node) => [node.name, acceptedRowKey(node)] as const),
        );
  const mcpConnectionKey = (localName: string) =>
    acceptedConnections === undefined
      ? Effect.map(desiredState.graph(), (graph) => {
          const node = graph.nodes.find(
            (candidate) => candidate.type === "mcp-server" && candidate.name === localName,
          );
          return node === undefined ? Option.none() : acceptedRowKey(node);
        })
      : Effect.succeed(acceptedConnections.get(localName) ?? Option.none());
  return {
    lockfile,
    state: documents.acceptedResolutionState.pipe(Effect.withSpan("LockfileReader.state")),
    entries: (type) => lockfile.pipe(Effect.map((value) => lockEntries[type].entries(value))),
    entry: (type, name) =>
      lockfile.pipe(Effect.map((value) => lockEntries[type].entry(value, name))),
    acceptedEntry: (type, name) =>
      Effect.gen(function* () {
        const key = type === "mcp-server" ? yield* mcpConnectionKey(name) : Option.some(name);
        if (Option.isNone(key)) return Option.none();
        return lockEntries[type].entry(yield* lockfile, key.value);
      }),
  };
};

export const LockfileReaderLive: Layer.Layer<
  LockfileReader,
  never,
  WorkspaceDocuments | DesiredStateReader
> = Layer.effect(
  LockfileReader,
  Effect.gen(function* () {
    return makeLockfileReader(yield* WorkspaceDocuments, yield* DesiredStateReader);
  }),
);
