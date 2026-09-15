/**
 * Environment-backed Layers for the knowledge-query feature. Only application
 * composition imports this module; feature logic keeps the `KnowledgeIndex`
 * requirement in its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  KnowledgeIndex,
  makeKnowledgeIndexSnapshot,
  queryKnowledgeIndexResult,
} from "./knowledge-index.js";

export const KnowledgeIndexLive = Layer.succeed(KnowledgeIndex, {
  makeSnapshot: (bundles) => Effect.sync(() => makeKnowledgeIndexSnapshot(bundles)),
  query: (snapshot, query) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return yield* Effect.fromResult(queryKnowledgeIndexResult(snapshot, query, now));
    }),
});
