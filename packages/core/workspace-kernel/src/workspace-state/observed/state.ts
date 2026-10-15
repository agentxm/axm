import * as SchemaIssue from "effect/SchemaIssue";
/** Cached scoped state-source loaders for `axm.json` and `axm.lock`. */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { LOCKFILE_VERSION, LockfileSchema, type Lockfile } from "../desired/lockfile/schema.js";
import { parseLockfileToml, LockfileTomlValueError } from "../desired/lockfile/toml-values.js";
import { LEGACY_LOCK_FILENAME } from "../workspace/constants.js";
import { formatSchemaIssuesToLines } from "@agentxm/extension-model/unstable/schema-issues";
import { SettingsSchema, type Settings } from "../desired/settings/schema.js";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
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

/** Decoded `axm.json` payload exposed by the settings cell. */
export type DecodedSettings = Settings;

/** Decoded `axm.lock` payload exposed by the lockfile cell. */
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

/** The lockfile version a legacy YAML lockfile declares, or `0` when it declares none. */
const legacyLockfileVersion = (bytes: string): number => {
  const declared = /^lockfileVersion:\s*(\d+)/mu.exec(bytes)?.[1];
  return declared === undefined ? 0 : Number.parseInt(declared, 10);
};

/**
 * Refuse a legacy `axm-lock.yaml` beside the expected lockfile. Its format is
 * not read, so its presence is the existing unsupported-version recovery.
 */
const refuseLegacyLockfile = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  lockfilePath: string,
) {
  const separator = Math.max(lockfilePath.lastIndexOf("/"), lockfilePath.lastIndexOf("\\"));
  const legacyPath = `${lockfilePath.slice(0, separator + 1)}${LEGACY_LOCK_FILENAME}`;
  if (legacyPath === lockfilePath) return;
  const legacyExists = yield* fs
    .exists(legacyPath)
    .pipe(Effect.mapError((cause) => new LockfileIoError({ path: legacyPath, cause })));
  if (!legacyExists) return;
  const legacy = yield* fs
    .readFileString(legacyPath)
    .pipe(Effect.mapError((cause) => new LockfileIoError({ path: legacyPath, cause })));
  return yield* new LockfileVersionUnsupported({
    path: legacyPath,
    observedVersion: legacyLockfileVersion(legacy),
    supportedVersion: LOCKFILE_VERSION,
  });
});

export const readLockfileBytes = Effect.fn("workspace.read-model.state.lockfile.raw")(function* (
  fs: FileSystem.FileSystem,
  lockfilePath: string,
) {
  yield* refuseLegacyLockfile(fs, lockfilePath);
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

/** Decode settings bytes with the same strict schema policy for every caller. */
export const decodeSettingsBytes = Effect.fn("workspace.read-model.state.settings.decode")(
  function* (path: string, bytes: string) {
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(bytes),
      catch: (): SettingsParseError =>
        new SettingsParseError({
          path,
          raw: "[Settings input withheld]",
          cause: new Error("Settings JSON syntax is invalid; input values are withheld"),
        }),
    });
    return yield* Schema.decodeUnknownEffect(SettingsSchema)(parsed, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError(
        (error) =>
          new SettingsDecodeError({
            path,
            issues:
              typeof parsed === "object" && parsed !== null && "mcpServers" in parsed
                ? SchemaIssue.makeFormatterStandardSchemaV1()(error.issue)
                    .issues.slice(0, 5)
                    .map(
                      (item) =>
                        `${(item.path ?? []).map((part) => (typeof part === "object" && part !== null && "key" in part ? String(part.key) : String(part))).join(".")}: invalid settings value (MCP input values withheld)`,
                    )
                : formatSchemaIssuesToLines(error.issue),
            raw:
              typeof parsed === "object" && parsed !== null && "mcpServers" in parsed
                ? "[MCP settings input withheld]"
                : parsed,
          }),
      ),
    );
  },
);

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

/** Decode lockfile bytes once with the current version gate and strict schema policy. */
export const decodeLockfileBytes = Effect.fn("workspace.read-model.state.lockfile.decode")(
  function* (path: string, bytes: string) {
    const parsed = yield* Effect.try({
      try: (): unknown => parseLockfileToml(bytes).document,
      catch: (cause) =>
        cause instanceof LockfileTomlValueError
          ? new LockfileDecodeError({
              path,
              issues: [cause.detail],
              raw: "[Lockfile input withheld]",
            })
          : new LockfileParseError({ path, raw: bytes, cause }),
    });
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.hasOwn(parsed, "version")
    ) {
      const observedVersion: unknown = Reflect.get(parsed, "version");
      if (
        typeof observedVersion === "number" &&
        Number.isSafeInteger(observedVersion) &&
        observedVersion > 0 &&
        observedVersion !== LOCKFILE_VERSION
      ) {
        return yield* Effect.fail(
          new LockfileVersionUnsupported({
            path,
            observedVersion,
            supportedVersion: LOCKFILE_VERSION,
          }),
        );
      }
    }
    return yield* Schema.decodeUnknownEffect(LockfileSchema)(parsed, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError(
        (error) =>
          new LockfileDecodeError({
            path,
            issues: formatSchemaIssuesToLines(error.issue),
            raw: parsed,
          }),
      ),
    );
  },
);

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
    const settingsRaw = yield* Effect.cached(loadRawSettingsBytes({ fs, settingsPath }));
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
