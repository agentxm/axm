import * as Effect from "effect/Effect";
import type { FileAccessError, ContextFilesAccessor } from "../../context.js";

export interface ContextFilesVFTNode {
  readonly hasFile: (posixPath: string) => boolean;
  readonly getFile: (posixPath: string) => Uint8Array | undefined;
  readonly listFiles?: (posixPath: string) => ReadonlyArray<string>;
}

export const makeVftContextFilesAccessor = (tree: ContextFilesVFTNode): ContextFilesAccessor => ({
  exists: (path) => {
    const normalized = normalizeAndCheck(path);
    if (normalized.kind !== "ok") {
      return Effect.succeed(false);
    }
    return Effect.succeed(tree.hasFile(normalized.path));
  },
  readBytes: (path) => {
    const normalized = normalizeAndCheck(path);
    if (normalized.kind === "escape") {
      return failFileAccess(path, "path-escape", `path escapes the accessor root: ${path}`);
    }
    const bytes = tree.getFile(normalized.path);
    if (bytes === undefined) {
      return failFileAccess(path, "read-error", `file not found at ${path}`);
    }
    return Effect.succeed(bytes);
  },
  listFiles: (path) => {
    const normalized = normalizeAndCheck(path);
    if (normalized.kind === "escape") {
      return Effect.fail(
        makeAccessError(path, "path-escape", `path escapes the accessor root: ${path}`),
      );
    }
    if (tree.listFiles === undefined) {
      return Effect.succeed([]);
    }
    return Effect.succeed([...tree.listFiles(normalized.path)].sort((a, b) => a.localeCompare(b)));
  },
});

type NormalizeResult = { readonly kind: "ok"; readonly path: string } | { readonly kind: "escape" };

const normalizeAndCheck = (path: string): NormalizeResult => {
  if (path === "" || path === "." || path === "./") {
    return { kind: "ok", path: "" };
  }
  if (/^[a-z]:[\\/]/i.test(path) || path.startsWith("/") || path.startsWith("\\")) {
    return { kind: "escape" };
  }
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const segment of normalized.split("/")) {
    if (segment === "..") {
      return { kind: "escape" };
    }
  }
  return { kind: "ok", path: normalized };
};

const makeAccessError = (
  path: string,
  reason: FileAccessError["reason"],
  message: string,
): FileAccessError => ({
  _tag: "FileAccessError" as const,
  path,
  reason,
  message,
});

const failFileAccess = (
  path: string,
  reason: FileAccessError["reason"],
  message: string,
): Effect.Effect<Uint8Array, FileAccessError> =>
  Effect.fail(makeAccessError(path, reason, message));
