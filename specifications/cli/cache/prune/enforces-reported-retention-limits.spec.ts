import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  CachePruneOutputSchema,
  CacheStatusOutputSchema,
  handleCachePrune,
  handleCacheStatus,
} from "axm.sh/specification-harness";
import { makeCacheSpecContext } from "../../../support/cache-harness.js";

export const specification = defineSpecification({
  requirement: "cli/cache/prune/enforces-reported-retention-limits",
  title: "Cache pruning enforces the reported retention limits",
  statement:
    "The cache prune command shall remove expired archives and enough excess archive storage to satisfy the reported 2 GiB limit, preserve unrelated files, and report the removed and remaining entry and byte totals.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/cli/src/root/cache/command.ts",
    "packages/registry-client/src/archive-cache.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Should removal of the oldest archives first and the exact expiration boundary be product guarantees? The current implementation chooses both; this requirement establishes the externally reported limits without fixing those choices.",
  ],
});

describe("Archive cache retention", () => {
  it.live(
    "removes an expired entry and an oversized entry using the command's effective policy",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makeCacheSpecContext;
          yield* context.provide(handleCacheStatus());
          const policy = yield* Schema.decodeUnknownEffect(CacheStatusOutputSchema)(
            context.rendererState.results[0]?.data,
          );
          const expired = context.writeArchive("expired");
          const old = new Date(Date.now() - (policy.maxAgeDays + 1) * 24 * 60 * 60 * 1000);
          fs.utimesSync(expired.file, old, old);
          const oversized = path.join(context.root, "oversized.zip");
          const descriptor = fs.openSync(oversized, "w");
          try {
            fs.ftruncateSync(descriptor, policy.maxBytes + 1);
          } finally {
            fs.closeSync(descriptor);
          }
          const unrelated = path.join(context.root, "operator-note.txt");
          fs.writeFileSync(unrelated, "retained outside archive accounting");
          yield* context.provide(handleCachePrune());
          const result = yield* Schema.decodeUnknownEffect(CachePruneOutputSchema)(
            context.rendererState.results[1]?.data,
          );
          expect(result.result).toEqual({
            removed: 2,
            bytesFreed: expired.bytes.length + policy.maxBytes + 1,
            remaining: 0,
            remainingBytes: 0,
          });
          expect(fs.existsSync(expired.file)).toBe(false);
          expect(fs.existsSync(oversized)).toBe(false);
          expect(fs.readFileSync(unrelated, "utf8")).toBe("retained outside archive accounting");
          const current = context.writeArchive("current");
          yield* context.provide(handleCachePrune());
          const repeated = yield* Schema.decodeUnknownEffect(CachePruneOutputSchema)(
            context.rendererState.results[2]?.data,
          );
          expect(repeated.result).toEqual({
            removed: 0,
            bytesFreed: 0,
            remaining: 1,
            remainingBytes: current.bytes.length,
          });
          expect(fs.readFileSync(current.file)).toEqual(current.bytes);
        }),
      ),
  );
});
