import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { zipSync } from "fflate";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  MAX_ARCHIVE_ENTRIES,
  MAX_BUFFERED_ARCHIVE_BYTES,
  MAX_EXTRACTED_ARCHIVE_BYTES,
  readBufferedArchive,
} from "./archive-limits.js";
import { extractZip } from "./utils.js";

export const specification = defineSpecification({
  requirement: "registry-client/archive-acquisition-is-bounded",
  title: "Archive acquisition refuses content that exceeds finite resource limits",
  statement:
    "AXM shall enforce finite compressed-body, expanded-content, and entry-count limits while acquiring a Registry archive, stop at the breached bound with a typed resource failure, and leave the target package tree unwritten.",
  class: "functional",
  role: "supporting",
  goals: ["trustworthy-distribution", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Controlled archive bytes and a temporary filesystem make the admitted byte count, extracted entries, typed refusal, and absence of target writes directly observable.",
  methods: ["boundary-value", "example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Bounded archive acquisition", () => {
  it("declares positive finite limits for compressed, expanded, and entry resources", () => {
    for (const limit of [
      MAX_BUFFERED_ARCHIVE_BYTES,
      MAX_EXTRACTED_ARCHIVE_BYTES,
      MAX_ARCHIVE_ENTRIES,
    ]) {
      expect(Number.isSafeInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
    }
  });

  it.effect("refuses an oversized disk archive before allocating or writing a package tree", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      const root = yield* files.makeTempDirectoryScoped({ prefix: "axm-bounded-archive-" });
      const archivePath = paths.join(root, "package.zip");
      const target = paths.join(root, "target");
      yield* files.writeFile(archivePath, new Uint8Array([1, 2, 3, 4, 5]));
      yield* files.makeDirectory(target);

      const failure = yield* readBufferedArchive(files, archivePath, 4).pipe(Effect.flip);
      expect(failure._tag).toBe("RegistryOperationFailed");
      if (failure._tag === "RegistryOperationFailed") expect(failure.category).toBe("quota");
      expect(yield* files.readDirectory(target)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses expanded bytes before writing extracted entries", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      const root = yield* files.makeTempDirectoryScoped({ prefix: "axm-bounded-unzip-" });
      const target = paths.join(root, "target");
      yield* files.makeDirectory(target);
      const archive = zipSync({ "skill.txt": new TextEncoder().encode("more than four") });

      const failure = yield* extractZip(archive, target, { maxExpandedBytes: 4 }).pipe(Effect.flip);
      expect(failure.category).toBe("quota");
      expect(yield* files.readDirectory(target)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
