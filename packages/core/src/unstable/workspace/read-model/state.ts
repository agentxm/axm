/** Cached scoped state-source loaders for `settings.json` and `axm-lock.yaml`. */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { LockfileSchema, type Lockfile } from "../../lockfile/schema.js";
import { migrateLegacyUniversalSkillArtifacts } from "../../lockfile/migration.js";
import { formatSchemaIssuesToLines } from "../../schema/format-issues.js";
import { SettingsSchema, type Settings } from "../../settings/schema.js";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  type LockfileReadError,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  type SettingsReadError,
} from "./errors.js";
import type { Scope } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Decoded `settings.json` payload exposed by the settings cell. */
export type DecodedSettings = Settings;

/** Decoded `axm-lock.yaml` payload exposed by the lockfile cell. */
export type DecodedLockfile = Lockfile;

/** Raw bytes of a workspace source file (path + literal content). */
export interface RawSourceBytes {
  readonly path: string;
  readonly bytes: string;
}

/** Cached decoded settings/lockfile cells plus their raw-bytes siblings. */
export interface ScopedStateLoaders {
  readonly settings: Effect.Effect<Option.Option<DecodedSettings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<DecodedLockfile>, LockfileReadError>;
  readonly settingsRaw: Effect.Effect<Option.Option<RawSourceBytes>, SettingsIoError>;
  readonly lockfileRaw: Effect.Effect<Option.Option<RawSourceBytes>, LockfileIoError>;
}

/** Construction inputs captured and threaded into every cached loader. */
export interface ScopedStateDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly settingsPath: string;
  readonly lockfilePath: string | null;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasLegacyIgnoredSettings = (value: unknown): boolean =>
  isRecord(value) && Object.hasOwn(value, "ignored");

// ---------------------------------------------------------------------------
// Raw bytes loaders (shared by the decoded loaders and the public raw cells)
// ---------------------------------------------------------------------------

const loadRawSettingsBytes = Effect.fn("workspace.read-model.state.settings.raw")(function* (deps: {
  readonly fs: FileSystem.FileSystem;
  readonly settingsPath: string;
}) {
  const { fs, settingsPath } = deps;
  const exists = yield* fs
    .exists(settingsPath)
    .pipe(Effect.mapError((cause) => new SettingsIoError({ path: settingsPath, cause })));
  if (!exists) return Option.none<RawSourceBytes>();
  const bytes = yield* fs
    .readFileString(settingsPath)
    .pipe(Effect.mapError((cause) => new SettingsIoError({ path: settingsPath, cause })));
  return Option.some<RawSourceBytes>({ path: settingsPath, bytes });
});

const loadRawLockfileBytes = Effect.fn("workspace.read-model.state.lockfile.raw")(function* (deps: {
  readonly fs: FileSystem.FileSystem;
  readonly lockfilePath: string;
}) {
  const { fs, lockfilePath } = deps;
  const exists = yield* fs
    .exists(lockfilePath)
    .pipe(Effect.mapError((cause) => new LockfileIoError({ path: lockfilePath, cause })));
  if (!exists) return Option.none<RawSourceBytes>();
  const bytes = yield* fs
    .readFileString(lockfilePath)
    .pipe(Effect.mapError((cause) => new LockfileIoError({ path: lockfilePath, cause })));
  return Option.some<RawSourceBytes>({ path: lockfilePath, bytes });
});

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
    const { path, bytes } = rawOpt.value;

    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(bytes),
      catch: (cause): SettingsParseError => new SettingsParseError({ path, raw: bytes, cause }),
    });

    if (hasLegacyIgnoredSettings(parsed)) {
      return yield* new SettingsDecodeError({
        path,
        issues: [
          "ignored: Legacy settings key is no longer supported; use feature config siblings such as skillsConfig.ignore",
        ],
        raw: parsed,
      });
    }

    const decoded = yield* Schema.decodeUnknownEffect(SettingsSchema)(parsed).pipe(
      Effect.mapError(
        (error) =>
          new SettingsDecodeError({
            path,
            issues: formatSchemaIssuesToLines(error.issue),
            raw: parsed,
          }),
      ),
    );
    return Option.some(decoded);
  }).pipe(Effect.withSpan("workspace.read-model.state.settings"));

// ---------------------------------------------------------------------------
// Lockfile loader (decode pipeline) — sources bytes from the cached raw cell
// ---------------------------------------------------------------------------

/** Decode lockfile from cached raw bytes. Source-independent (Decision 2). */
const loadLockfile = (
  rawCell: Effect.Effect<Option.Option<RawSourceBytes>, LockfileIoError>,
): Effect.Effect<Option.Option<DecodedLockfile>, LockfileReadError> =>
  Effect.gen(function* () {
    const rawOpt = yield* rawCell;
    if (Option.isNone(rawOpt)) return Option.none<DecodedLockfile>();
    const { path, bytes } = rawOpt.value;

    const parsed = yield* Effect.try({
      try: (): unknown => YAML.parse(bytes),
      catch: (cause): LockfileParseError => new LockfileParseError({ path, raw: bytes, cause }),
    });

    const decoded = yield* Schema.decodeUnknownEffect(LockfileSchema)(parsed).pipe(
      Effect.mapError(
        (error) =>
          new LockfileDecodeError({
            path,
            issues: formatSchemaIssuesToLines(error.issue),
            raw: parsed,
          }),
      ),
    );
    return Option.some(migrateLegacyUniversalSkillArtifacts(parsed, decoded));
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

    const settingsRaw = yield* Effect.cached(loadRawSettingsBytes({ fs, settingsPath }));
    const settings = yield* Effect.cached(loadSettings(settingsRaw));

    const lockfileRaw: ScopedStateLoaders["lockfileRaw"] =
      lockfilePath === null
        ? Effect.succeed(Option.none<RawSourceBytes>())
        : yield* Effect.cached(loadRawLockfileBytes({ fs, lockfilePath }));
    const lockfile: ScopedStateLoaders["lockfile"] =
      lockfilePath === null
        ? Effect.succeed(Option.none<DecodedLockfile>())
        : yield* Effect.cached(loadLockfile(lockfileRaw));

    return { settings, lockfile, settingsRaw, lockfileRaw } satisfies ScopedStateLoaders;
  });
