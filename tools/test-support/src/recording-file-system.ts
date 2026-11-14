import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

/** A primitive `FileSystem` call, or a `file.*` call on a handle obtained through `open`. */
export type RecordedFileSystemMethod =
  | "access"
  | "chmod"
  | "chown"
  | "copy"
  | "copyFile"
  | "link"
  | "lstat"
  | "makeDirectory"
  | "makeTempDirectory"
  | "makeTempDirectoryScoped"
  | "makeTempFile"
  | "makeTempFileScoped"
  | "open"
  | "readDirectory"
  | "readDirectoryEntries"
  | "readFile"
  | "readLink"
  | "realPath"
  | "remove"
  | "rename"
  | "stat"
  | "symlink"
  | "truncate"
  | "utimes"
  | "watch"
  | "writeFile"
  | "file.read"
  | "file.readAlloc"
  | "file.seek"
  | "file.stat"
  | "file.sync"
  | "file.truncate"
  | "file.write"
  | "file.writeAll";

/**
 * One completed primitive call. Paths are recorded exactly as the caller passed
 * them; temporary-path methods record the created path, or the requested
 * directory (empty when unspecified) when creation does not succeed.
 */
export interface RecordedFileSystemCall {
  readonly method: RecordedFileSystemMethod;
  readonly path: string;
  /** Second operand of `copy`, `copyFile`, `link`, `rename`, and `symlink`. */
  readonly toPath?: string;
  /** Bytes transferred by a successful content read or write. */
  readonly bytes?: number;
  readonly outcome: "success" | "failure" | "interrupted";
}

/** Inspection of the calls recorded since construction or the last `reset`. */
export interface FileSystemRecording {
  /** Calls in completion order, optionally narrowed to a method and a path in either operand. */
  readonly calls: (filter?: {
    readonly path?: string;
    readonly method?: RecordedFileSystemMethod;
  }) => ReadonlyArray<RecordedFileSystemCall>;
  /** Call counts by method for calls naming `path` in either operand. */
  readonly counts: (path: string) => Readonly<Partial<Record<RecordedFileSystemMethod, number>>>;
  /** Physical content read attempts: `readFile`, `file.read`, and `file.readAlloc`, including end-of-file reads. */
  readonly contentReads: (path: string) => number;
  /** Physical content write attempts: `writeFile`, `file.write`, and `file.writeAll`. */
  readonly writes: (path: string) => number;
  /** Forget every recorded call, for example after fixture setup. */
  readonly reset: () => void;
}

/** The recording handle for a filesystem provided by `layerRecordingFileSystem`. */
export class FileSystemRecorder extends Context.Service<FileSystemRecorder, FileSystemRecording>()(
  "@agentxm/test-support/recording-file-system/FileSystemRecorder",
) {}

interface Operands {
  readonly path: string;
  readonly toPath?: string;
}

const contentReadMethods: ReadonlySet<RecordedFileSystemMethod> = new Set([
  "readFile",
  "file.read",
  "file.readAlloc",
]);
const writeMethods: ReadonlySet<RecordedFileSystemMethod> = new Set([
  "writeFile",
  "file.write",
  "file.writeAll",
]);

const outcomeOf = <A, E>(exit: Exit.Exit<A, E>): RecordedFileSystemCall["outcome"] =>
  Exit.isSuccess(exit)
    ? "success"
    : Cause.hasInterruptsOnly(exit.cause)
      ? "interrupted"
      : "failure";

const names = (entry: RecordedFileSystemCall, path: string) =>
  entry.path === path || entry.toPath === path;

/**
 * Wrap every primitive of `base` once and rebuild the derived operations
 * (`exists`, `readFileString`, `writeFileString`, `stream`, `sink`, `glob`) with
 * `FileSystem.make`, so each derived call is recorded through exactly the
 * primitives it performs. Results and errors of `base` pass through unchanged.
 */
export const makeRecordingFileSystem = (
  base: FileSystem.FileSystem,
): {
  readonly fileSystem: FileSystem.FileSystem;
  readonly recording: FileSystemRecording;
} => {
  // Each append is one synchronous step, so concurrent fibers cannot interleave within it.
  let entries: Array<RecordedFileSystemCall> = [];

  const append = <A, E>(
    method: RecordedFileSystemMethod,
    operands: Operands,
    exit: Exit.Exit<A, E>,
    bytesOf?: (value: A) => number,
  ) =>
    Effect.sync(() => {
      entries.push(
        Object.freeze({
          method,
          ...operands,
          ...(Exit.isSuccess(exit) && bytesOf !== undefined ? { bytes: bytesOf(exit.value) } : {}),
          outcome: outcomeOf(exit),
        }),
      );
    });

  const recorded = <A, E, R>(
    method: RecordedFileSystemMethod,
    operands: Operands,
    operation: Effect.Effect<A, E, R>,
    bytesOf?: (value: A) => number,
  ): Effect.Effect<A, E, R> =>
    Effect.onExit(operation, (exit) => append(method, operands, exit, bytesOf));

  const recordedTemporary = <E, R>(
    method: RecordedFileSystemMethod,
    directory: string | undefined,
    operation: Effect.Effect<string, E, R>,
  ): Effect.Effect<string, E, R> =>
    Effect.onExit(operation, (exit) =>
      append(method, { path: Exit.isSuccess(exit) ? exit.value : (directory ?? "") }, exit),
    );

  const recordedFile = (path: string, file: FileSystem.File): FileSystem.File => ({
    [FileSystem.FileTypeId]: FileSystem.FileTypeId,
    stat: recorded(
      "file.stat",
      { path },
      Effect.suspend(() => file.stat),
    ),
    sync: recorded(
      "file.sync",
      { path },
      Effect.suspend(() => file.sync),
    ),
    seek: (offset, from) => recorded("file.seek", { path }, file.seek(offset, from)),
    read: (buffer, options) =>
      recorded("file.read", { path }, file.read(buffer, options), (count) => count),
    readAlloc: (size, options) =>
      recorded("file.readAlloc", { path }, file.readAlloc(size, options), (value) =>
        Option.isSome(value) ? value.value.byteLength : 0,
      ),
    truncate: (length) => recorded("file.truncate", { path }, file.truncate(length)),
    write: (buffer) => recorded("file.write", { path }, file.write(buffer), (count) => count),
    writeAll: (buffer) =>
      recorded("file.writeAll", { path }, file.writeAll(buffer), () => buffer.byteLength),
  });

  const fileSystem = FileSystem.make({
    access: (path, options) => recorded("access", { path }, base.access(path, options)),
    chmod: (path, mode) => recorded("chmod", { path }, base.chmod(path, mode)),
    chown: (path, uid, gid) => recorded("chown", { path }, base.chown(path, uid, gid)),
    copy: (path, toPath, options) =>
      recorded("copy", { path, toPath }, base.copy(path, toPath, options)),
    copyFile: (path, toPath) => recorded("copyFile", { path, toPath }, base.copyFile(path, toPath)),
    link: (path, toPath) => recorded("link", { path, toPath }, base.link(path, toPath)),
    lstat: (path) => recorded("lstat", { path }, base.lstat(path)),
    makeDirectory: (path, options) =>
      recorded("makeDirectory", { path }, base.makeDirectory(path, options)),
    makeTempDirectory: (options) =>
      recordedTemporary("makeTempDirectory", options?.directory, base.makeTempDirectory(options)),
    makeTempDirectoryScoped: (options) =>
      recordedTemporary(
        "makeTempDirectoryScoped",
        options?.directory,
        base.makeTempDirectoryScoped(options),
      ),
    makeTempFile: (options) =>
      recordedTemporary("makeTempFile", options?.directory, base.makeTempFile(options)),
    makeTempFileScoped: (options) =>
      recordedTemporary("makeTempFileScoped", options?.directory, base.makeTempFileScoped(options)),
    open: (path, options) =>
      recorded("open", { path }, base.open(path, options)).pipe(
        Effect.map((file) => recordedFile(path, file)),
      ),
    readDirectory: (path, options) =>
      recorded("readDirectory", { path }, base.readDirectory(path, options)),
    readDirectoryEntries: (path) =>
      recorded("readDirectoryEntries", { path }, base.readDirectoryEntries(path)),
    readFile: (path) =>
      recorded("readFile", { path }, base.readFile(path), (value) => value.byteLength),
    readLink: (path) => recorded("readLink", { path }, base.readLink(path)),
    realPath: (path) => recorded("realPath", { path }, base.realPath(path)),
    remove: (path, options) => recorded("remove", { path }, base.remove(path, options)),
    rename: (path, toPath) => recorded("rename", { path, toPath }, base.rename(path, toPath)),
    stat: (path) => recorded("stat", { path }, base.stat(path)),
    symlink: (path, toPath) => recorded("symlink", { path, toPath }, base.symlink(path, toPath)),
    truncate: (path, length) => recorded("truncate", { path }, base.truncate(path, length)),
    utimes: (path, atime, mtime) => recorded("utimes", { path }, base.utimes(path, atime, mtime)),
    watch: (path, options) =>
      base.watch(path, options).pipe(Stream.onExit((exit) => append("watch", { path }, exit))),
    writeFile: (path, data, options) =>
      recorded("writeFile", { path }, base.writeFile(path, data, options), () => data.byteLength),
  });

  const calls: FileSystemRecording["calls"] = (filter) =>
    entries.filter(
      (entry) =>
        (filter?.method === undefined || entry.method === filter.method) &&
        (filter?.path === undefined || names(entry, filter.path)),
    );
  const countWhere = (path: string, methods: ReadonlySet<RecordedFileSystemMethod>) =>
    entries.filter((entry) => methods.has(entry.method) && names(entry, path)).length;

  return {
    fileSystem,
    recording: {
      calls,
      counts: (path) => {
        const counts: Partial<Record<RecordedFileSystemMethod, number>> = {};
        for (const entry of calls({ path })) counts[entry.method] = (counts[entry.method] ?? 0) + 1;
        return counts;
      },
      contentReads: (path) => countWhere(path, contentReadMethods),
      writes: (path) => countWhere(path, writeMethods),
      reset: () => {
        entries = [];
      },
    },
  };
};

/** Provide a recording `FileSystem` over `base`, with its `FileSystemRecorder` handle. */
export const layerRecordingFileSystem = <E, R>(
  base: Layer.Layer<FileSystem.FileSystem, E, R>,
): Layer.Layer<FileSystem.FileSystem | FileSystemRecorder, E, R> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      return Context.make(FileSystem.FileSystem, fileSystem).pipe(
        Context.add(FileSystemRecorder, recording),
      );
    }),
  ).pipe(Layer.provide(base));
