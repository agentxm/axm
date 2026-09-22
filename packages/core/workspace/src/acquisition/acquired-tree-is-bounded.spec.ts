import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { defineSpecification } from "@agentxm/specification-metadata";

import { MAX_ACQUIRED_TREE_ENTRIES, measureAcquiredTree } from "./measure-acquired-tree.js";

export const specification = defineSpecification({
  requirement: "workspace/acquired-tree-is-bounded",
  title: "Acquired source trees are measured before retention",
  statement:
    "AXM shall measure the bytes and entries of an acquired source tree before retaining it for apply and refuse content that exceeds either finite limit.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "A temporary source tree makes byte and entry admission observable before a staged source can be retained.",
  methods: ["boundary-value", "example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Acquired tree measurement", () => {
  it("declares a finite positive entry limit", () => {
    expect(Number.isSafeInteger(MAX_ACQUIRED_TREE_ENTRIES)).toBe(true);
    expect(MAX_ACQUIRED_TREE_ENTRIES).toBeGreaterThan(0);
  });

  it.effect("refuses a tree over the byte limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-acquired-bytes-" });
      yield* fs.writeFile(path.join(root, "large.txt"), new TextEncoder().encode("five!"));
      const failure = yield* measureAcquiredTree(root, { maxBytes: 4 }).pipe(Effect.flip);
      expect(failure._tag).toBe("AcquiredTreeLimitExceeded");
      if (failure._tag === "AcquiredTreeLimitExceeded") expect(failure.resource).toBe("bytes");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a tree over the entry limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-acquired-entries-" });
      yield* fs.writeFile(path.join(root, "one.txt"), new Uint8Array([1]));
      yield* fs.writeFile(path.join(root, "two.txt"), new Uint8Array([2]));
      const failure = yield* measureAcquiredTree(root, { maxEntries: 1 }).pipe(Effect.flip);
      expect(failure._tag).toBe("AcquiredTreeLimitExceeded");
      if (failure._tag === "AcquiredTreeLimitExceeded") expect(failure.resource).toBe("entries");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
