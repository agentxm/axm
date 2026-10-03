import { gzipSync } from "node:zlib";
import { zipSync } from "fflate";
import { pack } from "tar-stream";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ExternalArchiveInvalid, extractExternalArchive } from "./index.js";

export const specification = defineSpecification({
  requirement: "extensions/acquisition/external-archives-retain-payloads",
  title: "External archives retain package bytes, modes, and contained links",
  statement:
    "AXM shall acquire ZIP, tar, and gzip-compressed tar payloads without rewriting content or executable modes, retain contained relative symbolic links, and refuse unsafe archive paths, ambiguous members, non-directory ancestors, escaping links, unsupported special entries, and content exceeding bounded acquisition limits.",
  class: "functional",
  role: "supporting",
  goals: ["trustworthy-distribution", "extension-adoption"],
  boundary: "platform",
  boundaryRationale: "Real staging directories expose archive modes and link behavior.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const bytes = new TextEncoder().encode("#!/bin/sh\necho original\n");
const tarball = (link = "scripts/run") =>
  Effect.scoped(
    Effect.gen(function* () {
      const stream = yield* Effect.acquireRelease(
        Effect.sync(() => pack()),
        (stream) =>
          Effect.sync(() => {
            stream.destroy();
          }),
      );
      stream.entry({ name: "scripts/run", mode: 0o755 }, bytes);
      stream.entry({ name: "SKILL.md" }, "# Original\n");
      stream.entry({ name: "empty", type: "directory" });
      stream.entry({ name: "run", type: "symlink", linkname: link });
      stream.finalize();
      const chunks: AsyncIterable<unknown> = stream;
      const collected = yield* Stream.fromAsyncIterable(
        chunks,
        (cause) => new ExternalArchiveInvalid({ detail: "Fixture tar failed", cause }),
      ).pipe(
        Stream.runFoldEffect(
          (): Uint8Array[] => [],
          (chunks, chunk) =>
            Effect.sync(() => {
              if (!(chunk instanceof Uint8Array)) throw new Error("Expected tar bytes");
              chunks.push(chunk);
              return chunks;
            }),
        ),
      );
      return Buffer.concat(collected);
    }),
  );

const zip = (link = "scripts/run") =>
  zipSync({
    "scripts/run": [bytes, { os: 3, attrs: 0o100755 << 16 }],
    "SKILL.md": new TextEncoder().encode("# Original\n"),
    "empty/": new Uint8Array(),
    run: [new TextEncoder().encode(link), { os: 3, attrs: 0o120777 << 16 }],
  });

describe("External archive payloads", () => {
  for (const format of ["zip", "tar", "tar.gz"] as const) {
    it.effect(`retains ${format} content, executable bits, empty directories and link text`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-payload-" });
        const archive = format === "zip" ? zip() : yield* tarball();
        yield* extractExternalArchive(
          format === "tar.gz" ? gzipSync(archive) : archive,
          format,
          root,
        );
        expect(Array.from(yield* fs.readFile(path.join(root, "run")))).toEqual(Array.from(bytes));
        expect(yield* fs.readLink(path.join(root, "run"))).toBe("scripts/run");
        expect((yield* fs.stat(path.join(root, "run"))).mode & 0o111).toBe(0o111);
        expect(yield* fs.readDirectory(path.join(root, "empty"))).toEqual([]);
        expect(yield* fs.readFileString(path.join(root, "SKILL.md"))).toBe("# Original\n");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect(`enforces bounded bytes and entries for ${format}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-limits-" });
        const raw = format === "zip" ? zip() : yield* tarball();
        const archive = format === "tar.gz" ? gzipSync(raw) : raw;
        for (const limits of [
          { maxCompressedBytes: 1 },
          { maxExpandedBytes: 1 },
          { maxEntries: 1 },
        ]) {
          const failure = yield* extractExternalArchive(archive, format, root, limits).pipe(
            Effect.flip,
          );
          expect(failure._tag).toBe("ExternalArchiveInvalid");
          expect(yield* fs.readDirectory(root)).toEqual([]);
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect(`refuses an escaping link in ${format}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-escape-" });
        const archive = format === "zip" ? zip("../outside") : yield* tarball("../outside");
        const failure = yield* extractExternalArchive(
          format === "tar.gz" ? gzipSync(archive) : archive,
          format,
          root,
        ).pipe(Effect.flip);
        expect(failure._tag).toBe("ExternalArchiveInvalid");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  for (const names of [["../outside"], ["/absolute"], ["a", "./a"], ["link", "link/child"]]) {
    it.effect(`refuses unsafe inventory ${names.join(", ")}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-inventory-" });
        const archive = zipSync(Object.fromEntries(names.map((name) => [name, bytes])));
        const failure = yield* extractExternalArchive(archive, "zip", root).pipe(Effect.flip);
        expect(failure._tag).toBe("ExternalArchiveInvalid");
        expect(yield* fs.readDirectory(root)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});
