import { withWork, annotateWork, type WorkKind } from "@agentxm/host-primitives/work-observation";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

// Only an existence probe declares that absence is an expected answer. A failed
// required read must not acquire that interpretation merely from its error tag.
const ExpectedAccessAbsence = Context.Reference<boolean>("axm/ExpectedAccessAbsence", {
  defaultValue: () => false,
});

/** Counts calls at the physical service boundary, not derived convenience calls. */
const observe = <A, E, R>(
  name: Extract<WorkKind, `axm.io.${string}`>,
  operation: Effect.Effect<A, E, R>,
) => {
  const observed =
    name === "axm.io.access"
      ? operation.pipe(
          Effect.tapError((error) =>
            PlatformError.isPlatformError(error) && error.reason._tag === "NotFound"
              ? Effect.flatMap(ExpectedAccessAbsence, (expected) =>
                  expected ? annotateWork({ "axm.failure.kind": "expected-absence" }) : Effect.void,
                )
              : Effect.void,
          ),
        )
      : operation;
  return withWork(name, observed, {
    attributes: { "axm.work.executed": 1 },
  });
};

const bytes = (value: number) => annotateWork({ "axm.io.bytes": value });

const observedFile = (file: FileSystem.File): FileSystem.File => ({
  ...file,
  stat: observe("axm.io.file-stat", file.stat),
  seek: (offset, from) => observe("axm.io.seek", file.seek(offset, from)),
  sync: observe("axm.io.sync", file.sync),
  read: (buffer, options) =>
    observe("axm.io.file-read", file.read(buffer, options).pipe(Effect.tap(bytes))),
  readAlloc: (size, options) =>
    observe(
      "axm.io.file-read",
      file
        .readAlloc(size, options)
        .pipe(Effect.tap((value) => bytes(Option.isSome(value) ? value.value.byteLength : 0))),
    ),
  truncate: (length) => observe("axm.io.file-truncate", file.truncate(length)),
  write: (buffer) => observe("axm.io.file-write", file.write(buffer).pipe(Effect.tap(bytes))),
  writeAll: (buffer) =>
    observe(
      "axm.io.file-write",
      file.writeAll(buffer).pipe(Effect.tap(() => bytes(buffer.byteLength))),
    ),
});

/** Rebuild derived reads/writes/streams over instrumented primitives once. */
export const observedFileSystem = (fs: FileSystem.FileSystem): FileSystem.FileSystem => {
  const observed = FileSystem.make({
    ...fs,
    access: (...args) => observe("axm.io.access", fs.access(...args)),
    copy: (...args) => observe("axm.io.copy", fs.copy(...args)),
    copyFile: (...args) => observe("axm.io.copy-file", fs.copyFile(...args)),
    chmod: (...args) => observe("axm.io.chmod", fs.chmod(...args)),
    chown: (...args) => observe("axm.io.chown", fs.chown(...args)),
    link: (...args) => observe("axm.io.link", fs.link(...args)),
    makeDirectory: (...args) => observe("axm.io.make-directory", fs.makeDirectory(...args)),
    makeTempDirectory: (...args) =>
      observe("axm.io.make-temp-directory", fs.makeTempDirectory(...args)),
    makeTempDirectoryScoped: (...args) =>
      observe("axm.io.make-temp-directory", fs.makeTempDirectoryScoped(...args)),
    makeTempFile: (...args) => observe("axm.io.make-temp-file", fs.makeTempFile(...args)),
    makeTempFileScoped: (...args) =>
      observe("axm.io.make-temp-file", fs.makeTempFileScoped(...args)),
    open: (...args) => observe("axm.io.open", fs.open(...args).pipe(Effect.map(observedFile))),
    readDirectory: (...args) => observe("axm.io.read-directory", fs.readDirectory(...args)),
    readDirectoryEntries: (...args) =>
      observe("axm.io.read-directory-entries", fs.readDirectoryEntries(...args)),
    readFile: (...args) =>
      observe(
        "axm.io.read-file",
        fs.readFile(...args).pipe(Effect.tap((value) => bytes(value.byteLength))),
      ),
    readLink: (...args) => observe("axm.io.read-link", fs.readLink(...args)),
    realPath: (...args) => observe("axm.io.real-path", fs.realPath(...args)),
    remove: (...args) => observe("axm.io.remove", fs.remove(...args)),
    rename: (...args) => observe("axm.io.rename", fs.rename(...args)),
    stat: (...args) => observe("axm.io.stat", fs.stat(...args)),
    lstat: (...args) => observe("axm.io.lstat", fs.lstat(...args)),
    symlink: (...args) => observe("axm.io.symlink", fs.symlink(...args)),
    truncate: (...args) => observe("axm.io.truncate", fs.truncate(...args)),
    utimes: (...args) => observe("axm.io.utimes", fs.utimes(...args)),
    writeFile: (...args) =>
      observe(
        "axm.io.write-file",
        fs.writeFile(...args).pipe(Effect.tap(() => bytes(args[1].byteLength))),
      ),
  });
  return {
    ...observed,
    exists: (path) =>
      observed.exists(path).pipe(Effect.provideService(ExpectedAccessAbsence, true)),
  };
};
