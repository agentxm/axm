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

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { acceptedRowKey } from "./accepted-reachability.js";
import type { LockfileValidationError } from "../lockfile/errors.js";
import type { Lockfile } from "../lockfile/schema.js";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { lockEntries, type LockEntriesOf, type LockEntryByType } from "./entry-accessors.js";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";
import type { WorkspaceRootEscape } from "./read-model/errors.js";
import type {
  LockfileState,
  WorkspaceLockfileReadFailure,
  WorkspaceStateReadFailure,
} from "./contracts.js";

type Read<A> = Effect.Effect<A, WorkspaceLockfileReadFailure>;

export interface LockfileReaderService {
  /** The selected scope's lockfile, empty when the file is absent. */
  readonly lockfile: Read<Lockfile>;
  /** Probe lockfile health without mutating disk: ok | missing | invalid. */
  readonly state: Effect.Effect<LockfileState, LockfileValidationError | WorkspaceRootEscape>;
  /** The accepted entries of one type, defaulting to `{}`. */
  readonly entries: <T extends InstallableExtensionType>(type: T) => Read<LockEntriesOf<T>>;
  /** One accepted entry by its lock key (the workspace name, or the MCP resolution key). */
  readonly entry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
  ) => Read<Option.Option<LockEntryByType[T]>>;
  /**
   * The accepted resolution one desired extension resolves to by its type and
   * workspace name. Every type keys its row by that name except an MCP
   * connection, whose local name resolves to the shared resolution of its
   * source; an inline or undesired connection has none.
   */
  readonly acceptedEntry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
  ) => Effect.Effect<Option.Option<LockEntryByType[T]>, WorkspaceStateReadFailure>;
}

export class LockfileReader extends ServiceMap.Service<LockfileReader, LockfileReaderService>()(
  "@agentxm/workspace/desired-state/LockfileReader",
) {}

export const makeLockfileReader = (
  documents: WorkspaceDocumentsService,
  desiredState: DesiredStateReaderService,
): LockfileReaderService => {
  const lockfile = documents.acceptedResolutions;
  const mcpConnectionKey = (localName: string) =>
    Effect.map(desiredState.graph(), (graph) => {
      const node = graph.nodes.find(
        (candidate) => candidate.type === "mcp-server" && candidate.name === localName,
      );
      return node === undefined ? Option.none() : acceptedRowKey(node);
    });
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
