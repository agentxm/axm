import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  computeMaterializedTreeIntegrity,
  MaterializedTreeInvalid,
} from "./workspace/materialized-tree.js";
import { treeIntegrityOfSync } from "./test-support/tree-integrity-sync.js";

it.effect("hashes fixture trees with the production materialized-tree algorithm", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.sync(() => fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-tree-integrity-"))),
      (directory) => Effect.sync(() => fs.rmSync(directory, { recursive: true, force: true })),
    );
    fs.mkdirSync(nodePath.join(root, "nested"));
    fs.writeFileSync(nodePath.join(root, "nested", "binary"), Buffer.from([0, 255, 10]));
    fs.writeFileSync(nodePath.join(root, "README.md"), "fixture\n");

    const production = yield* computeMaterializedTreeIntegrity(root).pipe(
      Effect.provide(NodeServices.layer),
    );
    expect(treeIntegrityOfSync(root)).toEqual(production);

    fs.symlinkSync("missing", nodePath.join(root, "link"));
    expect(() => treeIntegrityOfSync(root)).toThrow(MaterializedTreeInvalid);
  }).pipe(Effect.scoped),
);
