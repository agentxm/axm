import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { SourceNotResolvable } from "./errors.js";

export interface PluginMarketplaceSelection {
  readonly format: "claude" | "codex" | "cursor";
  readonly fields: Readonly<Record<string, unknown>>;
  readonly atMarketplaceRoot: boolean;
}

export interface PluginMarketplaceMember {
  readonly directory: string;
  readonly selection: PluginMarketplaceSelection;
  readonly marketplace: { readonly path: string; readonly name: string };
}

// Cursor documents a 10 MB maximum for the complete marketplace file.
const MAX_CURSOR_MARKETPLACE_BYTES = 10_000_000;

const Marketplace = Schema.Struct({
  plugins: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  metadata: Schema.optionalKey(Schema.Unknown),
});
const CursorMetadata = Schema.Struct({ pluginRoot: Schema.optionalKey(Schema.String) });
const LocalSource = Schema.Struct({
  source: Schema.optionalKey(Schema.Literal("local")),
  path: Schema.String,
});
const formats = [
  { format: "codex", manifest: ".agents/plugins/marketplace.json" },
  { format: "claude", manifest: ".claude-plugin/marketplace.json" },
  { format: "cursor", manifest: ".cursor-plugin/marketplace.json" },
] as const;

/** Bounded local marketplace membership; remote entries remain external source references. */
export const readPluginMarketplace = (directory: string, requested: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const invalid = (detail: string, cause?: unknown) =>
      new SourceNotResolvable({ category: "validation", detail, cause });
    const physicalRoot = yield* fs
      .realPath(directory)
      .pipe(Effect.mapError((cause) => invalid("Marketplace root could not be resolved", cause)));
    const contained = (target: string) =>
      Effect.gen(function* () {
        const physical = yield* fs
          .realPath(target)
          .pipe(
            Effect.mapError((cause) =>
              invalid(`Marketplace path could not be resolved: ${target}`, cause),
            ),
          );
        const relative = path.relative(physicalRoot, physical);
        if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
          return yield* invalid(`Marketplace path escapes its root: ${target}`);
      });
    for (const format of formats) {
      const manifest = path.join(directory, format.manifest);
      if (
        !(yield* fs
          .exists(manifest)
          .pipe(
            Effect.mapError((cause) =>
              invalid("Marketplace manifest could not be inspected", cause),
            ),
          ))
      )
        continue;
      yield* contained(manifest);
      if (format.format === "cursor") {
        const info = yield* fs
          .stat(manifest)
          .pipe(
            Effect.mapError((cause) =>
              invalid("Marketplace manifest could not be inspected", cause),
            ),
          );
        if (info.size > BigInt(MAX_CURSOR_MARKETPLACE_BYTES))
          return yield* invalid("Cursor marketplace manifest exceeds 10 MB");
      }
      const raw = yield* fs
        .readFileString(manifest)
        .pipe(Effect.mapError((cause) => invalid("Marketplace manifest could not be read", cause)));
      if (
        format.format === "cursor" &&
        new TextEncoder().encode(raw).byteLength > MAX_CURSOR_MARKETPLACE_BYTES
      )
        return yield* invalid("Cursor marketplace manifest exceeds 10 MB");
      const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Marketplace))(
        raw,
      ).pipe(
        Effect.mapError((cause) => invalid("Marketplace membership could not be decoded", cause)),
      );
      const members: PluginMarketplaceMember[] = [];
      const names = new Set<string>();
      for (const fields of parsed.plugins) {
        const name = fields["name"];
        if (typeof name !== "string" || name.length === 0 || names.has(name))
          return yield* invalid("Marketplace entries require distinct nonempty names");
        names.add(name);
        const source = fields["source"];
        const sourceObject =
          typeof source === "object" && source !== null && !Array.isArray(source)
            ? source
            : undefined;
        const declaresLocal =
          format.format === "cursor" ||
          (sourceObject !== undefined &&
            "source" in sourceObject &&
            sourceObject.source === "local");
        const structured = yield* Schema.decodeUnknownEffect(LocalSource)(source).pipe(
          Effect.option,
        );
        const relative =
          format.format === "codex"
            ? Option.isSome(structured) && structured.value.source === "local"
              ? structured.value.path
              : undefined
            : typeof source === "string" && !/^[a-z][a-z0-9+.-]*:/iu.test(source)
              ? source
              : format.format === "cursor" && Option.isSome(structured)
                ? structured.value.path
                : undefined;
        if (relative === undefined) {
          if (declaresLocal)
            return yield* invalid(
              `Marketplace entry ${name} has an invalid local source declaration`,
            );
          if (requested.some((value) => value === name || value.startsWith(`${name}/`)))
            return yield* invalid(
              `Marketplace entry ${name} uses an unsupported remote source; install its Git or HTTPS source directly`,
            );
          continue;
        }
        const metadata =
          format.format === "cursor" && parsed.metadata !== undefined
            ? yield* Schema.decodeUnknownEffect(CursorMetadata)(parsed.metadata).pipe(
                Effect.mapError((cause) =>
                  invalid("Cursor marketplace metadata could not be decoded", cause),
                ),
              )
            : {};
        const prefix = "pluginRoot" in metadata ? (metadata.pluginRoot ?? ".") : ".";
        if (path.isAbsolute(prefix) || prefix.includes("\\") || prefix.split("/").includes(".."))
          return yield* invalid(`Marketplace pluginRoot escapes its root: ${prefix}`);
        const selected = path.resolve(directory, prefix, relative);
        const selectedRelative = path.relative(directory, selected);
        if (
          relative.length === 0 ||
          path.isAbsolute(relative) ||
          relative.includes("\\") ||
          selectedRelative === ".." ||
          selectedRelative.startsWith(`..${path.sep}`)
        )
          return yield* invalid(`Marketplace source escapes its root: ${relative}`);
        yield* contained(selected);
        const info = yield* fs
          .stat(selected)
          .pipe(
            Effect.mapError((cause) => invalid("Marketplace member could not be inspected", cause)),
          );
        if (info.type !== "Directory")
          return yield* invalid(`Marketplace member is not a directory: ${relative}`);
        members.push({
          directory: selected,
          selection: { format: format.format, fields, atMarketplaceRoot: selectedRelative === "" },
          marketplace: { path: manifest, name },
        });
      }
      return Option.some(members);
    }
    return Option.none<ReadonlyArray<PluginMarketplaceMember>>();
  });
