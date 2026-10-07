import { SourceMap } from "node:module";
import { fileURLToPath } from "node:url";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { DIAGNOSTIC_SOURCES } from "../__generated__/diagnostic-sources.js";

declare const __AXM_BUILD_ROOT__: string | undefined;

type OwnedModule = (typeof DIAGNOSTIC_SOURCES)[number]["module"];
interface SourcePackage {
  readonly module: OwnedModule;
  readonly directory: string;
  readonly entry: string;
  readonly sourceEntry: string;
  readonly builtEntry: string;
  readonly sources: Readonly<Record<string, number>>;
}
export interface OwnedSourceFrame {
  readonly module: OwnedModule;
  readonly filename: string;
  readonly line: number;
  /** Sentry source columns are zero based; stack columns are one based. */
  readonly column: number;
}
interface StackLocation {
  readonly filename: string;
  readonly line: number;
  readonly column: number;
}

class SourceFrameUnavailable extends Data.TaggedError("SourceFrameUnavailable")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

const sourceMapSchema = Schema.Struct({
  version: Schema.Literal(3),
  file: Schema.optional(Schema.String),
  sourceRoot: Schema.optional(Schema.String),
  sources: Schema.Array(Schema.String),
  names: Schema.Array(Schema.String),
  mappings: Schema.String,
});

/** Interpret locations only; function text and messages never leave the local stack. */
const stackLocations = (stack: string): ReadonlyArray<StackLocation> => {
  const locations: Array<StackLocation> = [];
  for (const line of stack.slice(0, 8192).split("\n").slice(0, 33)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) continue;
    const call = trimmed.slice(3);
    const candidate = call.endsWith(")") ? call.slice(call.lastIndexOf("(") + 1, -1) : call;
    const match = /^(.+):([0-9]+):([0-9]+)$/u.exec(candidate);
    const filename = match?.[1];
    const row = Number(match?.[2]);
    const column = Number(match?.[3]);
    if (
      filename !== undefined &&
      Number.isSafeInteger(row) &&
      row > 0 &&
      Number.isSafeInteger(column) &&
      column > 0
    )
      locations.push({ filename, line: row, column });
  }
  return locations;
};

const localPath = (filename: string) =>
  Effect.try({
    try: () => (filename.startsWith("file:") ? fileURLToPath(filename) : filename),
    catch: (cause) => new SourceFrameUnavailable({ reason: "Invalid location", cause }),
  });

/** Bind installed package roots to public entry resolution, never cwd or stack text. */
const packageRoots = Effect.gen(function* () {
  const path = yield* Path.Path;
  const catalog = yield* Effect.tryPromise({
    try: () => import("../__generated__/diagnostic-sources.js"),
    catch: (cause) => new SourceFrameUnavailable({ reason: "Source catalog unavailable", cause }),
  });
  const packages: ReadonlyArray<SourcePackage> = catalog.DIAGNOSTIC_SOURCES;
  const roots: Array<{ readonly source: SourcePackage; readonly root: string }> = [];
  for (const source of packages) {
    if (typeof __AXM_BUILD_ROOT__ === "string") {
      roots.push({ source, root: path.join(__AXM_BUILD_ROOT__, source.directory) });
      continue;
    }
    const resolved = yield* Effect.try({
      try: () => (source.module === "axm.sh" ? import.meta.url : import.meta.resolve(source.entry)),
      catch: (cause) => new SourceFrameUnavailable({ reason: "Package entry unavailable", cause }),
    }).pipe(Effect.option);
    if (Option.isNone(resolved)) continue;
    const filename = yield* localPath(resolved.value).pipe(Effect.option);
    if (Option.isNone(filename)) continue;
    const suffixes =
      source.module === "axm.sh"
        ? ["src/cli-runtime/source-frames.ts", "dist/src/cli-runtime/source-frames.js"]
        : [source.sourceEntry, source.builtEntry];
    const normalized = filename.value.replaceAll("\\", "/");
    const suffix = suffixes.find((entry) => normalized.endsWith(`/${entry}`));
    if (suffix !== undefined)
      roots.push({ source, root: filename.value.slice(0, -(suffix.length + 1)) });
  }
  return roots;
});

const admitSource = (
  source: SourcePackage,
  relative: string,
  location: StackLocation,
): OwnedSourceFrame | undefined => {
  const filename = relative.replaceAll("\\", "/");
  const lines = source.sources[filename];
  if (
    lines === undefined ||
    location.line > lines ||
    !Number.isSafeInteger(location.line) ||
    location.line <= 0 ||
    !Number.isSafeInteger(location.column) ||
    location.column <= 0
  )
    return undefined;
  return { module: source.module, filename, line: location.line, column: location.column - 1 };
};

/** Read only an admitted owned JS file, bounded even if it changes during the read. */
const mapBuiltLocation = (location: StackLocation, root: string, source: SourcePackage) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const relative = path.relative(root, location.filename).replaceAll("\\", "/");
      if (!relative.startsWith("dist/src/") || !relative.endsWith(".js")) return undefined;
      const original = relative.slice("dist/".length).replace(/\.js$/u, ".ts");
      const originalTsx = relative.slice("dist/".length).replace(/\.js$/u, ".tsx");
      if (source.sources[original] === undefined && source.sources[originalTsx] === undefined)
        return undefined;
      const file = yield* fs.open(location.filename);
      const chunks: Array<Uint8Array> = [];
      const limit = 8 * 1024 * 1024;
      let length = 0;
      while (length <= limit) {
        const chunk = yield* file.readAlloc(Math.min(65536, limit + 1 - length));
        if (Option.isNone(chunk)) break;
        chunks.push(chunk.value);
        length += chunk.value.byteLength;
      }
      if (length > limit) return undefined;
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const text = new TextDecoder().decode(bytes);
      const encoded =
        /(?:^|\n)\/\/# sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)\s*$/u.exec(
          text,
        )?.[1];
      if (encoded === undefined) return undefined;
      const map = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(sourceMapSchema))(
        Buffer.from(encoded, "base64").toString("utf8"),
      );
      const origin = yield* Effect.try({
        try: () =>
          new SourceMap({
            ...map,
            sources: [...map.sources],
            names: [...map.names],
            file: map.file ?? "",
            sourceRoot: map.sourceRoot ?? "",
            sourcesContent: [],
          }).findOrigin(location.line, location.column),
        catch: (cause) => new SourceFrameUnavailable({ reason: "Invalid source map", cause }),
      });
      if (
        !("fileName" in origin) ||
        typeof origin.fileName !== "string" ||
        !("lineNumber" in origin) ||
        !("columnNumber" in origin)
      )
        return undefined;
      const originalFilename = path.resolve(
        path.dirname(location.filename),
        map.sourceRoot ?? "",
        origin.fileName,
      );
      return admitSource(source, path.relative(root, originalFilename), {
        filename: originalFilename,
        line: origin.lineNumber,
        column: origin.columnNumber,
      });
    }),
  );

/** Diagnostic collection is best effort and never changes the command outcome. */
export const collectOwnedSourceFrames = (
  causes: ReadonlyArray<{ readonly stack?: string | undefined }>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* packageRoots;
    const collected: Array<OwnedSourceFrame> = [];
    const seen = new Set<string>();
    const candidates = causes
      .slice(0, 16)
      .flatMap((cause) => (cause.stack === undefined ? [] : stackLocations(cause.stack)))
      .slice(0, 32);
    for (const candidate of candidates) {
      const filename = yield* localPath(candidate.filename).pipe(Effect.option);
      if (Option.isNone(filename)) continue;
      // Embedded Bun maps name inputs relative to the compiler's working
      // directory. Bind them to that build-owned directory, never user cwd.
      const absolute = path.isAbsolute(filename.value)
        ? filename.value
        : typeof __AXM_BUILD_ROOT__ === "string"
          ? path.resolve(__AXM_BUILD_ROOT__, "apps/cli", filename.value)
          : undefined;
      if (absolute === undefined) continue;
      const location = { ...candidate, filename: absolute };
      for (const { source, root } of roots) {
        const relative = path.relative(root, location.filename);
        const direct = admitSource(source, relative, location);
        const mapped =
          direct ??
          (yield* mapBuiltLocation(location, root, source).pipe(
            Effect.catchCause(() => Effect.succeed(undefined)),
          ));
        if (mapped === undefined) continue;
        const key = `${mapped.module}/${mapped.filename}:${mapped.line}:${mapped.column}`;
        if (!seen.has(key)) {
          seen.add(key);
          collected.push(mapped);
        }
        break;
      }
      if (collected.length === 16) break;
    }
    // Runtime stacks put the newest call first; Sentry expects oldest first.
    return collected.reverse();
  }).pipe(Effect.catchCause(() => Effect.succeed([])));
