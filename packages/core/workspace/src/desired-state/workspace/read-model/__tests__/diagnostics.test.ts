/**
 * Tests for the per-scope diagnostics buffer used by WorkspaceReadModel to
 * collect settings/lockfile/scanner warnings.
 *
 * Covers buffer lifecycle (fresh per scope), append/snapshot behavior,
 * concurrent emission ordering via the underlying Effect `Ref`, snapshot
 * stability, no automatic deduplication, and the `Warning` discriminator
 * shape.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { makeDiagnostics, type Diagnostics, type Warning } from "../diagnostics.js";

// Compile-time assertions on the Warning discriminator live in
// `diagnostics.type-test.ts`.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDiagnosticsEff: Effect.Effect<Diagnostics> = Effect.gen(function* () {
  const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
  return makeDiagnostics(ref);
});

// ---------------------------------------------------------------------------
// Behavioral tests
// ---------------------------------------------------------------------------

describe("workspace read-model diagnostics buffer", () => {
  describe("fresh buffer per scope", () => {
    it.effect("two diagnostics buffers built from independent Refs do not share state", () =>
      Effect.gen(function* () {
        const projectDiag = yield* makeDiagnosticsEff;
        const userDiag = yield* makeDiagnosticsEff;

        yield* projectDiag.append({ source: "settings", message: "project-only" });

        const projectSnap = yield* projectDiag.snapshot;
        const userSnap = yield* userDiag.snapshot;

        expect(projectSnap).toHaveLength(1);
        expect(projectSnap[0]?.message).toBe("project-only");
        expect(userSnap).toHaveLength(0);
      }),
    );
  });

  describe("append + snapshot semantics", () => {
    it.effect("sequential appends are observed in append order", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;

        yield* diag.append({ source: "settings", message: "a" });
        yield* diag.append({ source: "lockfile", message: "b" });
        yield* diag.append({ source: "scanner", message: "c" });

        const snap = yield* diag.snapshot;
        expect(snap.map((w) => w.message)).toEqual(["a", "b", "c"]);
        expect(snap.map((w) => w.source)).toEqual(["settings", "lockfile", "scanner"]);
      }),
    );

    it.effect("concurrent appends produce a buffer with all entries observed", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;

        yield* Effect.all(
          [
            diag.append({ source: "settings", message: "a" }),
            diag.append({ source: "lockfile", message: "b" }),
            diag.append({ source: "scanner", message: "c" }),
          ],
          { concurrency: "unbounded" },
        );

        const snap = yield* diag.snapshot;
        expect(snap).toHaveLength(3);

        // Don't assert ordering of unbounded concurrency; assert set equality on
        // the (source, message) pairs. `Ref.update` is atomic, so each append
        // commits exactly once and ordering reflects emission completion.
        const observed = snap.map((w) => `${w.source}:${w.message}`).sort();
        expect(observed).toEqual(["lockfile:b", "scanner:c", "settings:a"].sort());
      }),
    );

    it.effect("staggered concurrent appends commit in delay order (TestClock-deterministic)", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;

        // Three concurrent forks, each delayed by a distinct duration. The
        // shortest delay completes first; the longest completes last. Use
        // `TestClock.adjust` to drive virtual time forward so the order is
        // fully deterministic.
        const f1 = yield* Effect.forkChild(
          diag.append({ source: "settings", message: "first" }).pipe(Effect.delay("10 millis")),
        );
        const f2 = yield* Effect.forkChild(
          diag.append({ source: "lockfile", message: "second" }).pipe(Effect.delay("100 millis")),
        );
        const f3 = yield* Effect.forkChild(
          diag.append({ source: "scanner", message: "third" }).pipe(Effect.delay("1 second")),
        );

        // Drive virtual time past the longest delay so all forks complete.
        yield* TestClock.adjust("2 seconds");
        yield* Fiber.join(f1);
        yield* Fiber.join(f2);
        yield* Fiber.join(f3);

        const snap = yield* diag.snapshot;
        // The buffer reflects emission-completion order: shortest delay
        // first, longest last. This validates the design doc's "ordered by
        // emission completion" claim deterministically.
        expect(snap.map((w) => w.message)).toEqual(["first", "second", "third"]);
      }),
    );
  });

  describe("snapshot stability", () => {
    it.effect("a snapshot taken before later appends does not observe them", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;

        yield* diag.append({ source: "settings", message: "first" });
        const before = yield* diag.snapshot;
        yield* diag.append({ source: "lockfile", message: "second" });
        const after = yield* diag.snapshot;

        expect(before).toHaveLength(1);
        expect(before[0]?.message).toBe("first");
        expect(after).toHaveLength(2);
        expect(after.map((w) => w.message)).toEqual(["first", "second"]);
      }),
    );

    it.effect("a snapshot reflects the buffer's append-order at the moment it was taken", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;

        yield* diag.append({ source: "settings", message: "only" });
        const snap = yield* diag.snapshot;

        // The snapshot is structurally `ReadonlyArray<Warning>`. Type-level
        // immutability is the contract (mutation would not type-check); we
        // verify the runtime contents instead, which is the behavior callers
        // observe.
        expect(snap.map((w) => w.message)).toEqual(["only"]);
      }),
    );
  });

  describe("no automatic deduplication", () => {
    it.effect("two structurally identical warnings remain two entries", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;
        const warning: Warning = {
          source: "scanner",
          message: "directory unreadable",
          path: "/ws/.claude/skills",
          code: "scanner-io",
        };

        yield* diag.append(warning);
        yield* diag.append(warning);

        const snap = yield* diag.snapshot;
        expect(snap).toHaveLength(2);
        expect(snap[0]).toEqual(warning);
        expect(snap[1]).toEqual(warning);
      }),
    );

    it.effect("two equivalent-but-distinct warning objects also remain two entries", () =>
      Effect.gen(function* () {
        const diag = yield* makeDiagnosticsEff;

        yield* diag.append({ source: "settings", message: "dup", code: "deprecated-key" });
        yield* diag.append({ source: "settings", message: "dup", code: "deprecated-key" });

        const snap = yield* diag.snapshot;
        expect(snap).toHaveLength(2);
      }),
    );
  });
});
