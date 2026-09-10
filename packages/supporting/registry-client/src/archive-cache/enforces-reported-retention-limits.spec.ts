import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeCacheFixture } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/cache/prune/enforces-reported-retention-limits",
  title: "The archive cache reports its limits and enforces exactly those",
  statement:
    "The archive cache shall report its entry count, byte total, and effective size and age limits, and pruning shall remove expired archives and enough excess archive storage to satisfy exactly those reported limits, preserve unrelated files, and report the removed and remaining entry and byte totals.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/supporting/registry-client/src/archive-cache.ts"],
  supersedes: ["cli/cache/status/reports-usage-and-effective-limits"],
  assumptions: [],
  openQuestions: [
    "Should removal of the oldest archives first and the exact expiration boundary be product guarantees? The current implementation chooses both; this requirement establishes the externally reported limits without fixing those choices.",
  ],
});

describe("Archive cache retention", () => {
  it.live("removes an expired entry and an oversized entry using the reported policy", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeCacheFixture;
        const policy = yield* fixture.provide(fixture.cache.status());
        expect(policy.entries).toBe(0);
        expect(policy.bytes).toBe(0);
        expect(policy.maxAgeDays).toBeGreaterThan(0);

        const expired = fixture.writeArchive("expired");
        const old = new Date(Date.now() - (policy.maxAgeDays + 1) * 24 * 60 * 60 * 1000);
        fs.utimesSync(expired.file, old, old);
        const oversized = nodePath.join(fixture.root, "oversized.zip");
        const descriptor = fs.openSync(oversized, "w");
        try {
          fs.ftruncateSync(descriptor, policy.maxBytes + 1);
        } finally {
          fs.closeSync(descriptor);
        }
        const unrelated = nodePath.join(fixture.root, "operator-note.txt");
        fs.writeFileSync(unrelated, "retained outside archive accounting");

        // Reported usage counts exactly the archives, not the unrelated file.
        const populated = yield* fixture.provide(fixture.cache.status());
        expect(populated).toEqual({
          ...policy,
          entries: 2,
          bytes: expired.bytes.length + policy.maxBytes + 1,
        });

        expect(yield* fixture.provide(fixture.cache.prune())).toEqual({
          removed: 2,
          bytesFreed: expired.bytes.length + policy.maxBytes + 1,
          remaining: 0,
          remainingBytes: 0,
        });
        expect(fs.existsSync(expired.file)).toBe(false);
        expect(fs.existsSync(oversized)).toBe(false);
        expect(fs.readFileSync(unrelated, "utf8")).toBe("retained outside archive accounting");

        const current = fixture.writeArchive("current");
        expect(yield* fixture.provide(fixture.cache.prune())).toEqual({
          removed: 0,
          bytesFreed: 0,
          remaining: 1,
          remainingBytes: current.bytes.length,
        });
        expect(fs.readFileSync(current.file)).toEqual(current.bytes);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );
});
