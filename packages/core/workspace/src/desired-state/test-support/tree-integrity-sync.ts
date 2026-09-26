/** Synchronous fixture setup using the production tree-integrity algorithm. */

import * as Effect from "effect/Effect";

import type { TreeIntegrity } from "../workspace/materialized-tree.js";
import { treeIntegrityOf } from "../testing.js";

export const treeIntegrityOfSync = (root: string): TreeIntegrity =>
  Effect.runSync(treeIntegrityOf(root));
