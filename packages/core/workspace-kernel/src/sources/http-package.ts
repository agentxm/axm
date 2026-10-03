import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  ArtifactPathSchema,
  type HttpArtifactSnapshot,
} from "@agentxm/extension-model/unstable/sources/http-artifact";
import { MAX_ARCHIVE_ENTRIES, MAX_BUFFERED_ARCHIVE_BYTES } from "@agentxm/registry-client";
import { extractExternalArchive } from "../acquisition/index.js";
import { downloadHttpArtifact } from "./http-download.js";
import { SourceNetworkFailure, SourceNotResolvable } from "./errors.js";
import type { SkillArtifactOffer } from "./well-known-index.js";

const invalid = (detail: string) => new SourceNotResolvable({ category: "validation", detail });

const archiveFormat = (urls: ReadonlyArray<URL>, contentType: string | undefined) => {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime === "application/zip") return Effect.succeed("zip" as const);
  if (mime === "application/x-tar") return Effect.succeed("tar" as const);
  if (mime === "application/gzip" || mime === "application/x-gzip")
    return Effect.succeed("tar.gz" as const);
  for (const url of urls) {
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith(".zip")) return Effect.succeed("zip" as const);
    if (pathname.endsWith(".tar.gz") || pathname.endsWith(".tgz"))
      return Effect.succeed("tar.gz" as const);
    if (pathname.endsWith(".tar")) return Effect.succeed("tar" as const);
  }
  return Effect.fail(invalid("Archive URL and media type do not identify ZIP, tar, or gzip tar"));
};

/** Validate the complete inventory before requesting files or writing package content. */
const validateFileInventory = (paths: ReadonlyArray<string | undefined>, maxEntries: number) =>
  Effect.gen(function* () {
    if (paths.length === 0 || paths.length > maxEntries)
      return yield* invalid("HTTP file inventory exceeds the supported entry count");
    const seen = new Set<string>();
    const retained = new Map<string, string>();
    for (const item of paths) {
      const path = yield* Schema.decodeUnknownEffect(ArtifactPathSchema)(item).pipe(
        Effect.mapError(() => invalid("HTTP file inventory contains an unsafe path")),
      );
      const segments = path.split("/");
      for (let depth = 1; depth <= segments.length; depth++) {
        const prefix = segments.slice(0, depth).join("/");
        const key = prefix.normalize("NFC").toLocaleLowerCase("en-US");
        const prior = retained.get(key);
        if (prior !== undefined && prior !== prefix)
          return yield* invalid("HTTP file inventory contains colliding parent paths");
        retained.set(key, prefix);
        if (retained.size > maxEntries)
          return yield* invalid(
            "HTTP file inventory exceeds the entry count including implicit directories",
          );
      }
      const folded = path.normalize("NFC").toLocaleLowerCase("en-US");
      if (seen.has(folded)) return yield* invalid("HTTP file inventory contains duplicate paths");
      seen.add(folded);
    }
    if (!paths.includes("SKILL.md"))
      return yield* invalid("HTTP file inventory is missing SKILL.md");
    for (const file of seen) {
      const parts = file.split("/");
      for (let length = 1; length < parts.length; length++) {
        const parent = parts.slice(0, length).join("/");
        if (seen.has(parent))
          return yield* invalid("HTTP file inventory places a file below another file");
      }
    }
  });

const writeArtifact = (directory: string, relative: string, bytes: Uint8Array) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join(directory, relative);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFile(target, bytes, { flag: "wx" });
  });

const scratchDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.acquireRelease(
    fs.makeTempDirectory({ prefix: "axm-http-package-" }),
    (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
  );
});

/** Acquire one offer into a scoped tree, retaining a replayable digest for every input. */
export const acquireHttpOffer = (
  offer: SkillArtifactOffer,
  options: { readonly maxEntries?: number } = {},
) =>
  Effect.gen(function* () {
    const maxEntries = Math.min(options.maxEntries ?? MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_ENTRIES);
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1)
      return yield* invalid("HTTP discovery exceeds the retained entry limit");
    const directory = yield* scratchDirectory;
    if (offer.format === "files") {
      yield* validateFileInventory(
        offer.artifacts.map((artifact) => artifact.path),
        maxEntries,
      );
      const files: Array<Extract<HttpArtifactSnapshot, { format: "files" }>["files"][number]> = [];
      let remaining = MAX_BUFFERED_ARCHIVE_BYTES;
      for (const artifact of offer.artifacts) {
        const relative = yield* Schema.decodeUnknownEffect(ArtifactPathSchema)(artifact.path).pipe(
          Effect.mapError(() => invalid("HTTP file inventory contains an unsafe path")),
        );
        const downloaded = yield* downloadHttpArtifact(artifact.url, {
          ...(artifact.digest === undefined ? {} : { digest: artifact.digest }),
          maxBytes: remaining,
        });
        remaining -= downloaded.bytes.byteLength;
        yield* writeArtifact(directory, relative, downloaded.bytes);
        files.push({ path: relative, url: artifact.url, digest: downloaded.digest });
      }
      return { directory, snapshot: { format: "files", files } satisfies HttpArtifactSnapshot };
    }
    const artifact = offer.artifacts[0];
    if (artifact === undefined || offer.artifacts.length !== 1)
      return yield* invalid("Single-artifact skill requires exactly one download");
    const downloaded = yield* downloadHttpArtifact(artifact.url, {
      ...(artifact.digest === undefined ? {} : { digest: artifact.digest }),
    });
    const format =
      offer.format === "skill-md"
        ? "skill-md"
        : yield* archiveFormat([artifact.url, downloaded.url], downloaded.contentType);
    if (format === "skill-md") yield* writeArtifact(directory, "SKILL.md", downloaded.bytes);
    else yield* extractExternalArchive(downloaded.bytes, format, directory, { maxEntries });
    return {
      directory,
      snapshot: {
        format,
        url: artifact.url,
        digest: downloaded.digest,
      } satisfies HttpArtifactSnapshot,
    };
  }).pipe(
    Effect.catchTags({
      PlatformError: (cause) =>
        Effect.fail(
          new SourceNetworkFailure({ detail: "Could not stage HTTP source content", cause }),
        ),
      ExternalArchiveInvalid: (cause) => Effect.fail(invalid(cause.detail)),
    }),
  );

/** Replay accepted artifact inputs; discovery indexes and their current offers are not consulted. */
export const acquireAcceptedHttpPackage = (snapshot: HttpArtifactSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.format === "files") {
      return yield* acquireHttpOffer({
        name: "accepted",
        format: "files",
        artifacts: snapshot.files,
      });
    }
    const directory = yield* scratchDirectory;
    const downloaded = yield* downloadHttpArtifact(snapshot.url, { digest: snapshot.digest });
    if (snapshot.format === "skill-md")
      yield* writeArtifact(directory, "SKILL.md", downloaded.bytes);
    else yield* extractExternalArchive(downloaded.bytes, snapshot.format, directory);
    return { directory, snapshot };
  }).pipe(
    Effect.catchTags({
      PlatformError: (cause) =>
        Effect.fail(
          new SourceNetworkFailure({
            detail: "Could not stage accepted HTTP source content",
            cause,
          }),
        ),
      ExternalArchiveInvalid: (cause) => Effect.fail(invalid(cause.detail)),
    }),
  );
