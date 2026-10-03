import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MAX_ARCHIVE_ENTRIES } from "@agentxm/registry-client";
import {
  ArtifactDigestSchema,
  type ArtifactDigest,
} from "@agentxm/extension-model/unstable/sources/http-artifact";
import { SourceNotResolvable } from "./errors.js";
import { validateArtifactUrl } from "./http-download.js";

export const WELL_KNOWN_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

export interface SkillArtifactOffer {
  readonly name: string;
  readonly description?: string;
  readonly format: "skill-md" | "archive" | "files";
  readonly artifacts: ReadonlyArray<{
    readonly url: URL;
    readonly path?: string;
    readonly digest?: ArtifactDigest;
  }>;
}

const Index = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  skills: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
});
const refused = (detail: string) => new SourceNotResolvable({ category: "validation", detail });
const safeRelativePath = (value: string) =>
  value.length > 0 &&
  !value.includes("\\") &&
  !value.includes("\0") &&
  !value.startsWith("/") &&
  !/^[A-Za-z]:/.test(value) &&
  value.split("/").every((segment) => segment !== ".." && segment !== "." && segment !== "");

/** Decode current single-artifact indexes and deployed legacy file inventories distinctly. */
export const parseWellKnownIndex = (bytes: Uint8Array, indexUrl: URL) =>
  Effect.gen(function* () {
    yield* validateArtifactUrl(indexUrl);
    const raw = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      catch: () => refused("Well-known index is not UTF-8"),
    });
    const index = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Index))(raw).pipe(
      Effect.mapError(() => refused("Well-known index must contain a skills array")),
    );
    if (index.$schema !== undefined && index.$schema !== WELL_KNOWN_SCHEMA)
      return yield* refused("Unsupported well-known discovery schema");
    if (index.skills.length > MAX_ARCHIVE_ENTRIES)
      return yield* refused("Well-known index exceeds the supported entry count");
    const offers: SkillArtifactOffer[] = [];
    const names = new Set<string>();
    let artifactCount = 0;
    for (const entry of index.skills) {
      if (
        index.$schema !== undefined &&
        entry["type"] !== "skill-md" &&
        entry["type"] !== "archive"
      )
        continue;
      const name = entry["name"];
      if (typeof name !== "string" || name.length === 0)
        return yield* refused("Well-known skill entry requires a name");
      if (names.has(name)) return yield* refused("Duplicate well-known skill entry name");
      names.add(name);
      const description = entry["description"];
      const metadata = { name, ...(typeof description === "string" ? { description } : {}) };
      if (index.$schema === WELL_KNOWN_SCHEMA) {
        const locator = entry["url"];
        if (typeof locator !== "string" || locator.length === 0)
          return yield* refused("Well-known artifact requires a URL");
        const url = yield* Effect.try({
          try: () => new URL(locator, indexUrl),
          catch: () => refused("Invalid well-known artifact URL"),
        });
        yield* validateArtifactUrl(url);
        const digest = yield* Schema.decodeUnknownEffect(ArtifactDigestSchema)(
          entry["digest"],
        ).pipe(
          Effect.mapError(() => refused("Well-known v0.2 artifact requires a SHA-256 digest")),
        );
        const format = entry["type"];
        if (format === "skill-md" || format === "archive")
          offers.push({ ...metadata, format, artifacts: [{ url, digest }] });
        artifactCount++;
      } else {
        if (!safeRelativePath(name) || name.includes("/"))
          return yield* refused("Unsafe legacy well-known skill directory");
        const files = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.String))(
          entry["files"],
        ).pipe(Effect.mapError(() => refused("Legacy well-known skill requires a file inventory")));
        artifactCount += files.length;
        if (!files.includes("SKILL.md") || files.some((file) => !safeRelativePath(file)))
          return yield* refused(
            "Legacy well-known inventory requires SKILL.md and contained file paths",
          );
        if (new Set(files).size !== files.length)
          return yield* refused("Duplicate legacy well-known file path");
        const root = new URL(`${encodeURIComponent(name)}/`, indexUrl);
        offers.push({
          ...metadata,
          format: "files",
          artifacts: files.map((file) => ({
            path: file,
            url: new URL(file.split("/").map(encodeURIComponent).join("/"), root),
          })),
        });
      }
      if (artifactCount > MAX_ARCHIVE_ENTRIES)
        return yield* refused("Well-known index exceeds the supported artifact count");
    }
    return offers;
  });
