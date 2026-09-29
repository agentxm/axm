import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

/** A captured read view. Snapshot facts never establish native runtime availability. */
export type NativeObservationView =
  | { readonly kind: "workspace" }
  | {
      readonly kind: "git-index";
      readonly readRoot: string;
      readonly displayRoot: string;
      readonly fingerprint: string;
    };

/**
 * A read-only filesystem over captured index bytes. Resolve links ourselves:
 * asking the host to follow a captured absolute link would consult the live tree.
 */
export const observationViewFileSystem = (view: NativeObservationView) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (view.kind === "workspace") return fs;
    const readRoot = path.resolve(view.readRoot);
    const displayRoot = path.resolve(view.displayRoot);
    const within = (root: string, candidate: string) => {
      const relative = path.relative(root, candidate);
      return (
        relative === "" ||
        (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
      );
    };
    const refused = (target: string, method = "read") =>
      Effect.fail(
        PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method,
          pathOrDescriptor: target,
          description:
            "The captured Git-index view cannot access live or external filesystem state",
        }),
      );
    const notLink = (error: PlatformError.PlatformError): boolean => {
      const reason = error.reason;
      const cause = reason.cause;
      return (
        reason._tag === "Unknown" &&
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "EINVAL"
      );
    };
    const resolve = (
      target: string,
      followLeaf = true,
    ): Effect.Effect<string, PlatformError.PlatformError> =>
      Effect.gen(function* () {
        let current = path.resolve(target);
        if (!within(readRoot, current)) return yield* refused(target);
        for (let links = 0; links <= 40; links += 1) {
          const segments = path
            .relative(readRoot, current)
            .split(path.sep)
            .filter((part) => part.length > 0);
          let parent = readRoot;
          let redirected = false;
          for (const [index, part] of segments.entries()) {
            const candidate = path.join(parent, part);
            if (!followLeaf && index === segments.length - 1) return candidate;
            const link = yield* fs.readLink(candidate).pipe(Effect.result);
            if (link._tag === "Failure") {
              const reason = link.failure.reason;
              if (!notLink(link.failure) && reason._tag !== "NotFound") return yield* link.failure;
              parent = candidate;
              continue;
            }
            const destination = path.isAbsolute(link.success)
              ? within(displayRoot, link.success)
                ? path.resolve(readRoot, path.relative(displayRoot, link.success))
                : link.success
              : path.resolve(parent, link.success);
            if (!within(readRoot, destination)) return yield* refused(target);
            current = path.resolve(destination, ...segments.slice(index + 1));
            if (!within(readRoot, current)) return yield* refused(target);
            redirected = true;
            break;
          }
          if (!redirected) return current;
        }
        return yield* refused(target, "resolve-link-cycle");
      });
    const readDirectory: FileSystem.FileSystem["readDirectory"] = (target, options) =>
      Effect.gen(function* () {
        const directory = yield* resolve(target);
        const entries = yield* fs.readDirectory(directory);
        if (options?.recursive !== true) return entries;
        const descendants = [...entries];
        for (const entry of entries) {
          const child = path.join(directory, entry);
          const link = yield* fs.readLink(child).pipe(Effect.result);
          if (link._tag === "Success") continue;
          if (!notLink(link.failure)) return yield* link.failure;
          const info = yield* fs.stat(child);
          if (info.type === "Directory") {
            descendants.push(
              ...(yield* readDirectory(child, options)).map((name) => path.join(entry, name)),
            );
          }
        }
        return descendants;
      });
    return FileSystem.make({
      ...FileSystem.makeNoop({}),
      access: (target, options) =>
        resolve(target).pipe(Effect.flatMap((resolved) => fs.access(resolved, options))),
      readFile: (target) => resolve(target).pipe(Effect.flatMap(fs.readFile)),
      readLink: (target) => resolve(target, false).pipe(Effect.flatMap(fs.readLink)),
      realPath: (target) => resolve(target).pipe(Effect.flatMap(fs.realPath)),
      stat: (target) => resolve(target).pipe(Effect.flatMap(fs.stat)),
      readDirectory,
      open: (target, options) =>
        options?.flag !== undefined && options.flag !== "r"
          ? refused(target, "open")
          : resolve(target).pipe(Effect.flatMap((resolved) => fs.open(resolved, options))),
      chmod: (target) => refused(target, "chmod"),
      chown: (target) => refused(target, "chown"),
      copy: (target) => refused(target, "copy"),
      copyFile: (target) => refused(target, "copyFile"),
      link: (target) => refused(target, "link"),
      makeDirectory: (target) => refused(target, "makeDirectory"),
      makeTempDirectory: () => refused(readRoot, "makeTempDirectory"),
      makeTempDirectoryScoped: () => refused(readRoot, "makeTempDirectoryScoped"),
      makeTempFile: () => refused(readRoot, "makeTempFile"),
      makeTempFileScoped: () => refused(readRoot, "makeTempFileScoped"),
      remove: (target) => refused(target, "remove"),
      rename: (target) => refused(target, "rename"),
      symlink: (_, target) => refused(target, "symlink"),
      truncate: (target) => refused(target, "truncate"),
      utimes: (target) => refused(target, "utimes"),
      writeFile: (target) => refused(target, "writeFile"),
    });
  });
