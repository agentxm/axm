import { Volume } from "memfs";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

export interface MemoryFileSystemCall {
  readonly method: string;
  readonly path: string;
}

export type MemoryFileType = "directory" | "file" | "symlink";

export interface MemoryFileStore {
  readonly exists: (target: string) => boolean;
  readonly makeDirectory: (target: string) => void;
  readonly makeTempDirectory: (prefix: string) => string;
  readonly readDirectory: (
    target: string,
  ) => ReadonlyArray<{ readonly name: string; readonly type: MemoryFileType }>;
  readonly readFile: (target: string) => Uint8Array;
  readonly readFileString: (target: string) => string;
  readonly readLink: (target: string) => string;
  readonly realPath: (target: string) => string;
  readonly remove: (target: string) => void;
  readonly type: (target: string) => MemoryFileType | undefined;
  readonly writeFile: (target: string, content: string | Uint8Array) => void;
}

export interface MemoryFileSystem {
  readonly calls: ReadonlyArray<MemoryFileSystemCall>;
  readonly failures: ReadonlyArray<string>;
  readonly fileSystem: FileSystem.FileSystem;
  readonly files: MemoryFileStore;
}

const errorTag = (cause: unknown): PlatformError.SystemErrorTag => {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  if (code === "ENOENT") return "NotFound";
  if (code === "EEXIST") return "AlreadyExists";
  if (code === "EACCES") return "PermissionDenied";
  return "Unknown";
};

/** A byte-backed Effect filesystem with no host fallback. */
export const makeMemoryFileSystem = (): MemoryFileSystem => {
  const volume = new Volume();
  let sequence = 0;
  const calls: Array<MemoryFileSystemCall> = [];
  const failures: Array<string> = [];
  const readBytes = (target: string): Uint8Array => {
    const content = volume.readFileSync(target);
    return typeof content === "string"
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);
  };
  const call = <A>(method: string, target: string, run: () => A) =>
    Effect.try({
      try: () => {
        calls.push({ method, path: target });
        return run();
      },
      catch: (cause) =>
        PlatformError.systemError({
          _tag: errorTag(cause),
          module: "FileSystem",
          method,
          pathOrDescriptor: target,
          cause,
        }),
    });
  const unsupported = (method: string) => {
    failures.push(method);
    return Effect.fail(
      PlatformError.systemError({
        _tag: "Unknown",
        module: "FileSystem",
        method,
        cause: new Error(`Memory filesystem does not implement ${method}`),
      }),
    );
  };
  const remove: FileSystem.FileSystem["remove"] = (target, options) =>
    call("remove", target, () => {
      const entry = volume.lstatSync(target, { throwIfNoEntry: false });
      if (entry?.isSymbolicLink()) volume.unlinkSync(target);
      else
        volume.rmSync(target, {
          recursive: options?.recursive ?? false,
          force: options?.force ?? false,
        });
    });
  const temporary: FileSystem.FileSystem["makeTempDirectory"] = (options) =>
    call("makeTempDirectory", options?.directory ?? "/tmp", () => {
      const root = options?.directory ?? "/tmp";
      const target = `${root.replace(/\/$/u, "")}/${options?.prefix ?? "axm-"}${++sequence}`;
      volume.mkdirSync(target);
      return target;
    });
  const info = (target: string): FileSystem.File.Info => {
    const stat = volume.statSync(target);
    return {
      type: stat.isDirectory() ? "Directory" : "File",
      mtime: Option.some(stat.mtime),
      atime: Option.some(stat.atime),
      birthtime: Option.some(stat.birthtime),
      dev: Number(stat.dev),
      ino: Option.some(Number(stat.ino)),
      mode: Number(stat.mode),
      nlink: Option.some(Number(stat.nlink)),
      uid: Option.some(Number(stat.uid)),
      gid: Option.some(Number(stat.gid)),
      rdev: Option.some(Number(stat.rdev)),
      size: FileSystem.Size(stat.size),
      blksize: Option.some(FileSystem.Size(stat.blksize)),
      blocks: Option.some(Number(stat.blocks)),
    };
  };
  const fileSystem = FileSystem.make({
    ...FileSystem.makeNoop({}),
    access: (target, options) =>
      call("access", target, () =>
        volume.accessSync(target, (options?.readable ? 4 : 0) | (options?.writable ? 2 : 0)),
      ),
    glob: () => unsupported("glob"),
    chmod: (target, mode) => call("chmod", target, () => volume.chmodSync(target, mode)),
    chown: (target, uid, gid) => call("chown", target, () => volume.chownSync(target, uid, gid)),
    copy: (from, to, options) =>
      call("copy", to, () =>
        volume.cpSync(from, to, {
          recursive: true,
          dereference: false,
          force: options?.overwrite ?? false,
          preserveTimestamps: options?.preserveTimestamps ?? false,
        }),
      ),
    copyFile: (from, to) => call("copyFile", to, () => volume.copyFileSync(from, to)),
    link: (from, to) => call("link", to, () => volume.linkSync(from, to)),
    symlink: (from, to) => call("symlink", to, () => volume.symlinkSync(from, to)),
    makeDirectory: (target, options) =>
      call("makeDirectory", target, () => {
        volume.mkdirSync(target, {
          recursive: options?.recursive ?? false,
          mode: options?.mode ?? 0o777,
        });
      }),
    makeTempDirectory: temporary,
    makeTempDirectoryScoped: (options) =>
      Effect.acquireRelease(temporary(options), (target) =>
        remove(target, { recursive: true, force: true }).pipe(
          Effect.catch((cause) =>
            Effect.sync(() => {
              failures.push(`temporary cleanup: ${String(cause)}`);
            }),
          ),
        ),
      ),
    makeTempFile: () => unsupported("makeTempFile"),
    makeTempFileScoped: () => unsupported("makeTempFileScoped"),
    open: () => unsupported("open"),
    readDirectory: (target) =>
      call("readDirectory", target, () => volume.readdirSync(target).map(String)),
    readFile: (target) => call("readFile", target, () => readBytes(target)),
    readLink: (target) => call("readLink", target, () => String(volume.readlinkSync(target))),
    realPath: (target) => call("realPath", target, () => String(volume.realpathSync(target))),
    remove,
    rename: (from, to) => call("rename", to, () => volume.renameSync(from, to)),
    stat: (target) => call("stat", target, () => info(target)),
    truncate: (target, length) =>
      call("truncate", target, () =>
        volume.truncateSync(target, length === undefined ? undefined : Number(length)),
      ),
    utimes: (target, atime, mtime) =>
      call("utimes", target, () => volume.utimesSync(target, atime, mtime)),
    writeFile: (target, bytes, options) =>
      call("writeFile", target, () =>
        volume.writeFileSync(target, bytes, {
          flag: options?.flag ?? "w",
          mode: options?.mode ?? 0o666,
        }),
      ),
    watch: () => {
      throw new Error("Memory filesystem does not implement watch");
    },
  });
  const files: MemoryFileStore = {
    exists: (target) => volume.existsSync(target),
    makeDirectory: (target) => void volume.mkdirSync(target, { recursive: true }),
    makeTempDirectory: (prefix) => {
      const target = `/tmp/${prefix}${++sequence}`;
      volume.mkdirSync(target, { recursive: true });
      return target;
    },
    readDirectory: (target) =>
      volume.readdirSync(target).map((entry) => {
        const name = entry.toString();
        const info = volume.lstatSync(`${target.replace(/\/$/u, "")}/${name}`);
        return {
          name,
          type: info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file",
        };
      }),
    readFile: readBytes,
    readFileString: (target) => volume.readFileSync(target, "utf8").toString(),
    readLink: (target) => volume.readlinkSync(target).toString(),
    realPath: (target) => volume.realpathSync(target).toString(),
    remove: (target) => void volume.rmSync(target, { recursive: true, force: true }),
    type: (target) => {
      const entry = volume.lstatSync(target, { throwIfNoEntry: false });
      if (entry === undefined) return undefined;
      if (entry.isSymbolicLink()) return "symlink";
      return entry.isDirectory() ? "directory" : "file";
    },
    writeFile: (target, content) => {
      volume.mkdirSync(target.slice(0, Math.max(1, target.lastIndexOf("/"))), {
        recursive: true,
      });
      volume.writeFileSync(target, content);
    },
  };
  files.makeDirectory("/tmp");
  return { calls, failures, fileSystem, files };
};
