import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { computeMaterializedTreeIntegrity } from "./materialized-tree.js";

const layer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe("computeMaterializedTreeIntegrity", () => {
  it.effect("is deterministic and changes for edits, additions, and removals", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-"));
      nodeFs.mkdirSync(nodePath.join(root, "src"));
      nodeFs.writeFileSync(nodePath.join(root, "src", "a.txt"), "one");
      const first = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      const repeated = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(repeated).toBe(first);
      nodeFs.writeFileSync(nodePath.join(root, "src", "a.txt"), "two");
      const edited = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(edited).not.toBe(first);
      nodeFs.writeFileSync(nodePath.join(root, "src", "b.txt"), "extra");
      const added = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(added).not.toBe(edited);
      nodeFs.rmSync(nodePath.join(root, "src", "a.txt"));
      const removed = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(removed).not.toBe(added);
    }),
  );

  it.effect("rejects symlinks", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-link-"));
      nodeFs.writeFileSync(nodePath.join(root, "target.txt"), "target");
      nodeFs.symlinkSync("target.txt", nodePath.join(root, "link.txt"));
      const result = yield* Effect.result(
        computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer)),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
