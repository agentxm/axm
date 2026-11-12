/** Read sharing for a single stable phase. Never retain this context across writes. */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Sink from "effect/Sink";
import { CanonicalNativePath } from "../../locations/index.js";

export const makeObservationReadView = (
  fs: FileSystem.FileSystem,
  canonical: Context.Service.Shape<typeof CanonicalNativePath>,
  isActive: () => boolean = () => true,
  invalidate: () => void = () => undefined,
) => {
  let valid = true;
  const close = () => {
    valid = false;
    invalidate();
  };
  const mutation =
    <Args extends ReadonlyArray<unknown>, A, E, R>(
      write: (...args: Args) => Effect.Effect<A, E, R>,
    ) =>
    (...args: Args) =>
      Effect.sync(close).pipe(Effect.andThen(Effect.suspend(() => write(...args))));
  const share = <Args extends ReadonlyArray<unknown>, A, E>(
    operation: string,
    read: (...args: Args) => Effect.Effect<A, E>,
  ) => {
    const cells = new Map<string, Effect.Effect<A, E>>();
    return (...args: Args) =>
      Effect.gen(function* () {
        // Prepared closures can outlive preparation. They may retain this port,
        // but never its observations after the owning phase has returned.
        if (!valid || !isActive()) return yield* read(...args);
        // Preserve spelling: resolving .. can change traversal through a symlink.
        const key = JSON.stringify(args);
        const previous = cells.get(key);
        if (previous !== undefined) return yield* previous;
        const created = yield* Effect.cached(
          read(...args).pipe(
            Effect.withSpan(`axm.observation.${operation}`, {
              attributes: { "axm.work.count": 1 },
            }),
          ),
        );
        const selected = cells.get(key) ?? created;
        cells.set(key, selected);
        return yield* selected;
      });
  };
  const readFile = share("read-file", (target: string) => fs.readFile(target));
  const readDirectory = share("read-directory", (target: string, recursive: boolean) =>
    fs.readDirectory(target, { recursive }),
  );
  const readDirectoryEntries = share("read-directory-entries", fs.readDirectoryEntries);
  // Rebuild derived operations over the captured primitives. Forwarding fs.glob
  // or fs.readFileString would retain the original, uncaptured filesystem.
  const io = FileSystem.make({
    ...fs,
    access: share("access", fs.access),
    stat: share("stat", fs.stat),
    lstat: share("lstat", fs.lstat),
    realPath: share("real-path", fs.realPath),
    readLink: share("read-link", fs.readLink),
    readFile,
    readDirectory: (target, options) => readDirectory(target, options?.recursive === true),
    readDirectoryEntries,
  });
  const readFileString = share("decode-text", io.readFileString);
  const captured: FileSystem.FileSystem = {
    ...fs,
    copy: mutation(fs.copy),
    copyFile: mutation(fs.copyFile),
    chmod: mutation(fs.chmod),
    chown: mutation(fs.chown),
    link: mutation(fs.link),
    makeDirectory: mutation(fs.makeDirectory),
    makeTempDirectory: mutation(fs.makeTempDirectory),
    makeTempDirectoryScoped: mutation(fs.makeTempDirectoryScoped),
    makeTempFile: mutation(fs.makeTempFile),
    makeTempFileScoped: mutation(fs.makeTempFileScoped),
    remove: mutation(fs.remove),
    rename: mutation(fs.rename),
    symlink: mutation(fs.symlink),
    truncate: mutation(fs.truncate),
    utimes: mutation(fs.utimes),
    writeFile: mutation(fs.writeFile),
    writeFileString: mutation(fs.writeFileString),
    open: (target, options) =>
      options?.flag === undefined || options.flag === "r"
        ? fs.open(target, options)
        : mutation(fs.open)(target, options),
    sink: (target, options) =>
      Sink.unwrap(Effect.sync(close).pipe(Effect.map(() => fs.sink(target, options)))),
    access: io.access,
    exists: io.exists,
    stat: io.stat,
    lstat: io.lstat,
    realPath: io.realPath,
    readLink: io.readLink,
    glob: io.glob,
    // Cached mutable buffers and arrays never escape to a consumer.
    readFile: (target) => readFile(target).pipe(Effect.map((bytes) => Uint8Array.from(bytes))),
    readFileString: (target, encoding) => readFileString(target, encoding ?? "utf8"),
    readDirectory: (target, options) =>
      io.readDirectory(target, options).pipe(Effect.map((entries) => [...entries])),
    readDirectoryEntries: (target) =>
      readDirectoryEntries(target).pipe(
        Effect.map((entries) => entries.map((entry) => ({ ...entry }))),
      ),
  };
  return Context.make(FileSystem.FileSystem, captured).pipe(
    Context.add(
      CanonicalNativePath,
      canonical === undefined ? undefined : share("canonical-path", canonical),
    ),
  );
};
