import { gzipSync } from "node:zlib";
import { zipSync } from "fflate";
import { pack } from "tar-stream";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  OperationExtractionBudget,
  type OperationExtractionBudgetService,
} from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ExternalArchiveInvalid, extractExternalArchive } from "./index.js";

export const specification = defineSpecification({
  requirement: "extensions/acquisition/external-archives-retain-payloads",
  title: "External archives retain package bytes, modes, and contained links",
  statement:
    "AXM shall acquire ZIP, tar, and gzip-compressed tar payloads without rewriting content or executable modes, retain contained relative symbolic links, hold an operation extraction slot while extracting, refuse unsafe archive paths, ambiguous members, non-directory ancestors, escaping links, unsupported special entries, undecodable content, content that differs from its declared sizes, and content exceeding bounded acquisition limits, and leave the staging directory unwritten when refusing content or cancelled during decoding.",
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

  for (const [label, declaredSize] of [
    ["understates", 1],
    ["overstates", 20],
  ] as const)
    it.effect(`refuses a ZIP entry whose metadata ${label} its expanded bytes`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-declared-" });
        const archive = zipSync({ "large.txt": new TextEncoder().encode("longer than four") });
        const centralDirectory = archive.findIndex(
          (byte, index) =>
            byte === 0x50 &&
            archive[index + 1] === 0x4b &&
            archive[index + 2] === 0x01 &&
            archive[index + 3] === 0x02,
        );
        expect(centralDirectory).toBeGreaterThanOrEqual(0);
        const view = new DataView(archive.buffer, archive.byteOffset);
        view.setUint32(22, declaredSize, true);
        view.setUint32(centralDirectory + 24, declaredSize, true);

        const failure = yield* extractExternalArchive(archive, "zip", root).pipe(Effect.flip);
        expect(failure._tag).toBe("ExternalArchiveInvalid");
        expect(yield* fs.readDirectory(root)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

  it.effect("refuses ZIP entries whose combined declared size exceeds the limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-declared-total-" });
      const archive = zipSync({
        "first.txt": new TextEncoder().encode("abc"),
        "second.txt": new TextEncoder().encode("def"),
      });
      const failure = yield* extractExternalArchive(archive, "zip", root, {
        maxExpandedBytes: 5,
      }).pipe(Effect.flip);
      expect(failure.detail).toContain("expanded-byte limit");
      expect(yield* fs.readDirectory(root)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses undecodable ZIP data", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-undecodable-" });
      const failure = yield* extractExternalArchive(
        new Uint8Array([0x00, 0x01, 0x02, 0x03]),
        "zip",
        root,
      ).pipe(Effect.flip);
      expect(failure._tag).toBe("ExternalArchiveInvalid");
      expect(yield* fs.readDirectory(root)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("leaves the staging directory unwritten when cancelled during decoding", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-interrupted-" });
      const content = Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, index) => index % 251);
      const archive = zipSync({ "skill.txt": content }, { level: 0 });

      const worker = yield* extractExternalArchive(archive, "zip", root).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      expect(worker.pollUnsafe()).toBeUndefined();

      yield* Fiber.interrupt(worker);
      const exit = yield* Fiber.await(worker);
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(yield* fs.readDirectory(root)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("extracts only while holding an operation extraction slot", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-budget-" });
      const requested = yield* Deferred.make<void>();
      const granted = yield* Deferred.make<void>();
      const budget: OperationExtractionBudgetService = {
        withExtraction: (effect) =>
          Deferred.succeed(requested, undefined).pipe(
            Effect.andThen(Deferred.await(granted)),
            Effect.andThen(effect),
          ),
      };

      const worker = yield* extractExternalArchive(zip(), "zip", root).pipe(
        Effect.provideService(OperationExtractionBudget, budget),
        Effect.forkChild,
      );
      yield* Deferred.await(requested);
      expect(yield* fs.readDirectory(root)).toEqual([]);

      yield* Deferred.succeed(granted, undefined);
      yield* Fiber.join(worker);
      expect(yield* fs.readFileString(path.join(root, "SKILL.md"))).toBe("# Original\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
