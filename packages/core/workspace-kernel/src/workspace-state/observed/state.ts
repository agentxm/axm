/** Cached scoped state-source loaders for `axm.json` and `axm.lock`. */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type {
  LockfileIoError,
  LockfileReadError,
  LockfileVersionUnsupported,
} from "../desired/lockfile/errors.js";
import { decodeLockfileBytes, readLockfileBytes } from "../desired/lockfile/read.js";
import type { Lockfile } from "../desired/lockfile/schema.js";
import type { SettingsIoError, SettingsReadError } from "../desired/settings/errors.js";
import { decodeSettingsBytes, readSettingsBytes } from "../desired/settings/read.js";
import type { Settings } from "../desired/settings/schema.js";
import type { RawSourceBytes } from "../desired/source-bytes.js";
import type { Scope } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Decoded `axm.json` payload exposed by the settings cell. */
export type DecodedSettings = Settings;

/** Decoded `axm.lock` payload exposed by the lockfile cell. */
export type DecodedLockfile = Lockfile;

/** Cached decoded settings/lockfile cells plus their raw-bytes siblings. */
export interface ScopedStateLoaders {
  readonly settings: Effect.Effect<Option.Option<DecodedSettings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<DecodedLockfile>, LockfileReadError>;
  readonly settingsRaw: Effect.Effect<Option.Option<RawSourceBytes>, SettingsIoError>;
  readonly lockfileRaw: Effect.Effect<
    Option.Option<RawSourceBytes>,
    LockfileIoError | LockfileVersionUnsupported
  >;
}

/** Construction inputs captured and threaded into every cached loader. */
export interface ScopedStateDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly settingsPath: string;
  readonly lockfilePath: string | null;
}

// ---------------------------------------------------------------------------
// Settings loader (decode pipeline) — sources bytes from the cached raw cell
// ---------------------------------------------------------------------------

/** Decode settings from cached raw bytes. Source-independent (Decision 2). */
const loadSettings = (
  rawCell: Effect.Effect<Option.Option<RawSourceBytes>, SettingsIoError>,
): Effect.Effect<Option.Option<DecodedSettings>, SettingsReadError> =>
  Effect.gen(function* () {
    const rawOpt = yield* rawCell;
    if (Option.isNone(rawOpt)) return Option.none<DecodedSettings>();
    return Option.some(yield* decodeSettingsBytes(rawOpt.value.path, rawOpt.value.bytes));
  }).pipe(Effect.withSpan("workspace.read-model.state.settings"));

// ---------------------------------------------------------------------------
// Lockfile loader (decode pipeline) — sources bytes from the cached raw cell
// ---------------------------------------------------------------------------

/** Decode lockfile from cached raw bytes. Source-independent (Decision 2). */
const loadLockfile = (
  rawCell: ScopedStateLoaders["lockfileRaw"],
): Effect.Effect<Option.Option<DecodedLockfile>, LockfileReadError> =>
  Effect.gen(function* () {
    const rawOpt = yield* rawCell;
    if (Option.isNone(rawOpt)) return Option.none<DecodedLockfile>();
    return Option.some(yield* decodeLockfileBytes(rawOpt.value.path, rawOpt.value.bytes));
  }).pipe(Effect.withSpan("workspace.read-model.state.lockfile"));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the cached, requirement-free `ScopedStateLoaders` for one scope. */
export const makeScopedStateApi = (
  _scope: Scope,
  deps: ScopedStateDeps,
): Effect.Effect<ScopedStateLoaders> =>
  Effect.gen(function* () {
    const { fs, settingsPath, lockfilePath } = deps;
    const settingsRaw = yield* Effect.cached(readSettingsBytes({ fs, settingsPath }));
    const settings = yield* Effect.cached(loadSettings(settingsRaw));

    const lockfileRaw: ScopedStateLoaders["lockfileRaw"] =
      lockfilePath === null
        ? Effect.succeed(Option.none<RawSourceBytes>())
        : yield* Effect.cached(readLockfileBytes(fs, lockfilePath));
    const lockfile: ScopedStateLoaders["lockfile"] =
      lockfilePath === null
        ? Effect.succeed(Option.none<DecodedLockfile>())
        : yield* Effect.cached(loadLockfile(lockfileRaw));

    return { settings, lockfile, settingsRaw, lockfileRaw } satisfies ScopedStateLoaders;
  });
