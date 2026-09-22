import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  MAX_COPIED_EXTENSION_BYTES,
  MAX_COPIED_EXTENSION_ENTRIES,
  copyExtensionDirectory,
} from "./copy-directory.js";

export const specification = defineSpecification({
  requirement: "workspace/extension-directory-copy-is-bounded",
  title: "Extension directory copies have finite byte and entry limits",
  statement:
    "AXM shall reject an extension directory that exceeds finite byte or entry limits before writing its target tree and stream admitted content with bounded filesystem work.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "A temporary source and destination make the copied bytes, entry count, typed refusal, and absence of target writes directly observable.",
  methods: ["boundary-value", "example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Bounded extension directory copy", () => {
  it("declares positive finite byte and entry limits", () => {
    for (const limit of [MAX_COPIED_EXTENSION_BYTES, MAX_COPIED_EXTENSION_ENTRIES]) {
      expect(Number.isSafeInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
    }
  });

  it.effect("rejects an oversized source before creating its target", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-copy-bound-" });
      const source = path.join(root, "source");
      const target = path.join(root, "target");
      yield* fs.makeDirectory(source);
      yield* fs.writeFile(
        path.join(source, "SKILL.md"),
        new TextEncoder().encode("more than four"),
      );

      const failure = yield* copyExtensionDirectory(source, target, { maxBytes: 4 }).pipe(
        Effect.flip,
      );
      expect(failure._tag).toBe("DirectoryCopyLimitExceeded");
      if (failure._tag === "DirectoryCopyLimitExceeded") expect(failure.resource).toBe("bytes");
      expect(yield* fs.exists(target)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects excess entries before creating its target", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-copy-entries-" });
      const source = path.join(root, "source");
      const target = path.join(root, "target");
      yield* fs.makeDirectory(source);
      yield* fs.writeFile(path.join(source, "one.txt"), new Uint8Array([1]));
      yield* fs.writeFile(path.join(source, "two.txt"), new Uint8Array([2]));

      const failure = yield* copyExtensionDirectory(source, target, { maxEntries: 1 }).pipe(
        Effect.flip,
      );
      expect(failure._tag).toBe("DirectoryCopyLimitExceeded");
      if (failure._tag === "DirectoryCopyLimitExceeded") expect(failure.resource).toBe("entries");
      expect(yield* fs.exists(target)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
