import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { FileAccessError, DocsAccessor } from "../../context.js";

export interface DocsAccessorPlatform {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

type ResolveResult =
  | { readonly kind: "ok"; readonly absolute: string; readonly relative: string }
  | { readonly kind: "escape" };

export const makePlatformDocsAccessor = (
  platform: DocsAccessorPlatform,
  absoluteRoot: string,
): DocsAccessor => {
  const { fs, path } = platform;
  const normalizedRoot = path.resolve(absoluteRoot);

  const resolveWithinRoot = (input: string): ResolveResult => {
    if (input === "" || input === "." || input === "./") {
      return { kind: "ok", absolute: normalizedRoot, relative: "" };
    }
    if (/^[a-z]:[\\/]/i.test(input) || input.startsWith("/") || input.startsWith("\\")) {
      return { kind: "escape" };
    }
    const normalized = input.replace(/\\/g, "/").replace(/^\.\//, "");
    for (const segment of normalized.split("/")) {
      if (segment === "..") {
        return { kind: "escape" };
      }
    }
    const absolute = path.resolve(normalizedRoot, normalized);
    if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
      return { kind: "escape" };
    }
    return { kind: "ok", absolute, relative: normalized };
  };

  const makeAccessError = (
    p: string,
    reason: FileAccessError["reason"],
    message: string,
  ): FileAccessError => ({
    _tag: "FileAccessError" as const,
    path: p,
    reason,
    message,
  });

  const scanFiles = (
    absoluteDir: string,
    relativeDir: string,
  ): Effect.Effect<ReadonlyArray<string>, FileAccessError> =>
    Effect.gen(function* () {
      const entries = yield* fs
        .readDirectory(absoluteDir)
        .pipe(
          Effect.mapError((cause) =>
            makeAccessError(
              relativeDir,
              "read-error",
              `read failed at ${relativeDir}: ${String(cause)}`,
            ),
          ),
        );
      const nested = yield* Effect.forEach(
        entries,
        (entry) =>
          Effect.gen(function* () {
            const absolute = path.join(absoluteDir, entry);
            const relative = relativeDir === "" ? entry : `${relativeDir}/${entry}`;
            const stat = yield* fs.stat(absolute).pipe(Effect.option);
            if (stat._tag === "None") {
              return [] satisfies ReadonlyArray<string>;
            }
            if (stat.value.type === "Directory") {
              return yield* scanFiles(absolute, relative);
            }
            return [relative] satisfies ReadonlyArray<string>;
          }),
        { concurrency: 1 },
      );
      return nested.flat();
    });

  return {
    exists: (p) => {
      const resolved = resolveWithinRoot(p);
      if (resolved.kind !== "ok") {
        return Effect.succeed(false);
      }
      return fs.exists(resolved.absolute).pipe(Effect.catch(() => Effect.succeed(false)));
    },
    readBytes: (p) => {
      const resolved = resolveWithinRoot(p);
      if (resolved.kind === "escape") {
        return Effect.fail(
          makeAccessError(p, "path-escape", `path escapes the accessor root: ${p}`),
        );
      }
      return fs
        .readFile(resolved.absolute)
        .pipe(
          Effect.mapError((cause) =>
            makeAccessError(p, "read-error", `read failed at ${p}: ${String(cause)}`),
          ),
        );
    },
    listFiles: (p) => {
      const resolved = resolveWithinRoot(p);
      if (resolved.kind === "escape") {
        return Effect.fail(
          makeAccessError(p, "path-escape", `path escapes the accessor root: ${p}`),
        );
      }
      return scanFiles(resolved.absolute, resolved.relative).pipe(
        Effect.map((files) => [...files].sort((a, b) => a.localeCompare(b))),
      );
    },
  };
};
