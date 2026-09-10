/**
 * Lockfile reader: the selected scope's accepted resolutions — the lockfile
 * health probe, the per-type entry maps, one entry by name, and the shared
 * MCP resolution a local connection name accepts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { LockfileValidationError } from "../lockfile/errors.js";
import type { Lockfile, McpServerLockEntry } from "../lockfile/schema.js";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { lockEntries, type LockEntriesOf, type LockEntryByType } from "./entry-accessors.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { WorkspaceRootEscape } from "./read-model/errors.js";
import type {
  LockfileState,
  WorkspaceLockfileReadFailure,
  WorkspaceStateReadFailure,
} from "./service-interface.js";
import { readLockfileCell } from "./state-cells.js";

type Read<A> = Effect.Effect<A, WorkspaceLockfileReadFailure, FileSystem.FileSystem | Path.Path>;

export interface LockfileReaderService {
  /** The selected scope's lockfile, empty when the file is absent. */
  readonly lockfile: Read<Lockfile>;
  /** Probe lockfile health without mutating disk: ok | missing | invalid. */
  readonly state: Effect.Effect<
    LockfileState,
    LockfileValidationError | WorkspaceRootEscape,
    FileSystem.FileSystem | Path.Path
  >;
  /** The accepted entries of one type, defaulting to `{}`. */
  readonly entries: <T extends InstallableExtensionType>(type: T) => Read<LockEntriesOf<T>>;
  /** One accepted entry by its lock key (the workspace name, or the MCP resolution key). */
  readonly entry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
  ) => Read<Option.Option<LockEntryByType[T]>>;
  /** Resolve a local MCP connection name to its shared accepted resolution. */
  readonly mcpServerForConnection: (
    localName: string,
  ) => Effect.Effect<
    Option.Option<McpServerLockEntry>,
    WorkspaceStateReadFailure,
    FileSystem.FileSystem | Path.Path
  >;
}

export class LockfileReader extends ServiceMap.Service<LockfileReader, LockfileReaderService>()(
  "@agentxm/workspace-state/LockfileReader",
) {}

export const makeLockfileReader = (
  location: WorkspaceLocationService,
  desiredState: DesiredStateReaderService,
): LockfileReaderService => {
  const lockfile = readLockfileCell(location, location.runtimeDir);
  return {
    lockfile,
    state: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs
        .exists(location.lockPath)
        .pipe(
          Effect.mapError(
            (cause) =>
              new LockfileValidationError({ path: location.lockPath, step: "probe", cause }),
          ),
        );
      if (!exists) return "missing";
      // An unreadable or corrupt lockfile is actionable workspace state, not
      // a violated invariant.
      return yield* lockfile.pipe(
        Effect.as("ok" as const),
        Effect.catchTag(
          [
            "LockfileIoError",
            "LockfileParseError",
            "LockfileDecodeError",
            "LockfileVersionUnsupported",
          ],
          () => Effect.succeed("invalid" as const),
        ),
      );
    }).pipe(Effect.withSpan("LockfileReader.state")),
    entries: (type) => lockfile.pipe(Effect.map((value) => lockEntries[type].entries(value))),
    entry: (type, name) =>
      lockfile.pipe(Effect.map((value) => lockEntries[type].entry(value, name))),
    mcpServerForConnection: (localName) =>
      Effect.gen(function* () {
        const graph = yield* desiredState.graph();
        const node = graph.nodes.find(
          (candidate) => candidate.type === "mcp-server" && candidate.name === localName,
        );
        if (node === undefined || node.authority === "inline") return Option.none();
        return lockEntries["mcp-server"].entry(yield* lockfile, node.identity);
      }),
  };
};

export const LockfileReaderLive: Layer.Layer<
  LockfileReader,
  never,
  WorkspaceLocation | DesiredStateReader
> = Layer.effect(
  LockfileReader,
  Effect.gen(function* () {
    return makeLockfileReader(yield* WorkspaceLocation, yield* DesiredStateReader);
  }),
);
