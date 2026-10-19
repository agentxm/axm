/** The strict `axm.lock` read: raw bytes, then TOML parse, version gate, and schema decode. */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { formatSchemaIssuesToLines } from "@agentxm/extension-model/unstable/schema-issues";
import { LEGACY_LOCK_FILENAME } from "../../workspace/constants.js";
import type { RawSourceBytes } from "../source-bytes.js";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
} from "./errors.js";
import { LOCKFILE_VERSION, LockfileSchema } from "./schema.js";
import { LockfileTomlValueError, parseLockfileToml } from "./toml-values.js";

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
