import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { CacheStatusOutputSchema, handleCacheStatus } from "axm.sh/specification-harness";
import { makeCacheSpecContext } from "../../../support/cache-harness.js";

export const specification = defineSpecification({
  requirement: "cli/cache/status/reports-usage-and-effective-limits",
  title: "Cache status reports archive usage and effective limits",
  statement:
    "The cache status command shall report the number and total bytes of cached archives together with the effective size and age limits in its machine result.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/cli/src/root/cache/command.ts",
    "packages/cli/src/root/cache/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Is the current 90-day age limit a product commitment or an implementation default that may change?",
  ],
});

describe("Cache usage", () => {
  it.effect("reports empty and populated archive storage in one flat result per invocation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* makeCacheSpecContext;
        yield* context.provide(handleCacheStatus());
        const empty = yield* Schema.decodeUnknownEffect(CacheStatusOutputSchema)(
          context.rendererState.results[0]?.data,
        );
        expect(empty.entries).toBe(0);
        expect(empty.bytes).toBe(0);
        expect(empty.maxBytes).toBe(2 * 1024 * 1024 * 1024);
        expect(empty.maxAgeDays).toBeGreaterThan(0);
        const first = context.writeArchive("first");
        const second = context.writeArchive("second archive");
        yield* context.provide(handleCacheStatus());
        expect(context.rendererState.results).toHaveLength(2);
        const populated = yield* Schema.decodeUnknownEffect(CacheStatusOutputSchema)(
          context.rendererState.results[1]?.data,
        );
        expect(populated).toEqual({
          ...empty,
          entries: 2,
          bytes: first.bytes.length + second.bytes.length,
        });
      }),
    ),
  );
});
