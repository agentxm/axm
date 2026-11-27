import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
/** The strict `axm.lock` read: raw bytes, then TOML parse, version gate, and schema decode. */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Predicate from "effect/Predicate";
import { formatSchemaIssuesToLines } from "@agentxm/extension-model/unstable/schema-issues";
import type { RawSourceBytes } from "../source-bytes.js";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
} from "./errors.js";
import { LOCKFILE_VERSION, LockfileSchema } from "./schema.js";
import {
  LockfileTomlValueError,
  parseLockfileToml,
  type ParsedLockfileToml,
} from "./toml-values.js";

export const readLockfileBytes = Effect.fn("workspace.read-model.state.lockfile.raw")(function* (
  fs: FileSystem.FileSystem,
  lockfilePath: string,
) {
  const exists = yield* fs
    .exists(lockfilePath)
    .pipe(Effect.mapError((cause) => new LockfileIoError({ path: lockfilePath, cause })));
  if (!exists) return Option.none<RawSourceBytes>();
  const bytes = yield* fs
    .readFileString(lockfilePath)
    .pipe(Effect.mapError((cause) => new LockfileIoError({ path: lockfilePath, cause })));
  return Option.some<RawSourceBytes>({ path: lockfilePath, bytes });
});

/** Parse once, retaining tool-owned kinds independently of the accepted-resolution view. */
export const parseLockfileBytes = (path: string, bytes: string) =>
  Effect.try({
    try: () => parseLockfileToml(bytes),
    catch: (cause) =>
      cause instanceof LockfileTomlValueError
        ? new LockfileDecodeError({
            path,
            issues: [cause.detail],
            raw: "[Lockfile input withheld]",
          })
        : new LockfileParseError({ path, raw: bytes, cause }),
  }).pipe((effect) =>
    withWork("axm.parse.lockfile", effect, { attributes: { "axm.work.count": 1 } }),
  );

/** Decode the admitted document without parsing the same bytes a second time. */
export const decodeLockfileDocument = Effect.fnUntraced(
  function* (path: string, document: ParsedLockfileToml) {
    yield* annotateWork({ "axm.work.count": 1 });
    const parsed = document.document;
    if (Predicate.isObject(parsed) && Object.hasOwn(parsed, "version")) {
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
  (effect) => withWork("axm.parse.lockfile-decode", effect),
);

/** Strict raw-byte entry point used by ordinary readers. */
export const decodeLockfileBytes = (path: string, bytes: string) =>
  parseLockfileBytes(path, bytes).pipe(
    Effect.flatMap((parsed) => decodeLockfileDocument(path, parsed)),
  );
