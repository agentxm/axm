import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Tracer from "effect/Tracer";
import { zipSync } from "fflate";
import {
  CurrentArchiveWorkObserver,
  validateArchive,
  type ArchiveWorkFact,
  type ValidatedArchive,
} from "@agentxm/extension-content";
import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";
import { prepare, previewOrApply } from "./index.js";
import { makePublishWorld, publishDocument, publishFailureOf, requestFor } from "./test-helpers.js";

/** The admitted-archive class is exported only as a type; its prototype is reached through an instance. */
const hasCopyBytes = (value: unknown): value is { copyBytes(this: ValidatedArchive): Uint8Array } =>
  Predicate.hasProperty(value, "copyBytes") && Predicate.isFunction(value.copyBytes);

/** Count every whole-archive copy any admitted archive hands out, prepared or rebuilt. */
const spyOnArchiveCopies = Effect.gen(function* () {
  const probe = yield* validateArchive(zipSync({ probe: new Uint8Array([1]) }, { level: 0 }));
  const prototype: unknown = Object.getPrototypeOf(probe);
  if (!hasCopyBytes(prototype)) throw new Error("Admitted archives expose copyBytes");
  return vi.spyOn(prototype, "copyBytes");
});

const apply = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(),
  recovery: { command: [], arguments: [] },
});

describe("prepared archive ownership", () => {
  for (const type of ["knowledge", "hook"] as const) {
    it.effect(
      `admits ${type} once during preparation and freshly rebuilds before uploading owned bytes`,
      () =>
        Effect.gen(function* () {
          const world = makePublishWorld({
            settings: { [type === "hook" ? "hooks" : "knowledge"]: { review: "workspace" } },
          });
          const spans: Tracer.NativeSpan[] = [];
          const facts: ArchiveWorkFact[] = [];
          const tracer = Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              spans.push(span);
              return span;
            },
          });
          const count = (name: string) => spans.filter((span) => span.name === name).length;
          const observe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
            effect.pipe(
              Effect.provideService(CurrentArchiveWorkObserver, {
                record: (fact) =>
                  Effect.sync(() => {
                    facts.push(fact);
                  }),
              }),
              Effect.withTracer(tracer),
              Effect.withTracerEnabled(true),
            );
          const copies = yield* spyOnArchiveCopies;
          try {
            world.write(type, { name: "review" });
            const ready = yield* world
              .provide(prepare(requestFor(world, { preview: false })))
              .pipe(observe);
            expect(ready._tag).toBe("Ready");
            if (ready._tag !== "Ready") return;
            const candidate = ready.candidate.uploadCandidates[0];
            expect(candidate).toBeDefined();
            if (candidate === undefined) return;
            const preparedCopies = copies.mock.calls.length;
            const original = candidate.archive.copyBytes();
            candidate.archive.copyBytes().fill(0);
            copies.mockClear();
            expect(facts.filter((fact) => fact.kind === "parse")).toHaveLength(1);
            expect(count("axm.archive.parse")).toBe(0);
            expect(count("axm.archive.admit")).toBe(1);
            expect(count("axm.archive.decode-manifest")).toBe(1);
            const result = yield* world
              .provide(previewOrApply(ready.candidate, apply))
              .pipe(observe);
            expect(publishDocument(result).counts.published).toBe(1);
            expect(
              new Uint8Array(
                world.archive("review", "1.0.0", type === "hook" ? "hooks" : "knowledge"),
              ),
            ).toEqual(original);
            // Preparation takes its digests from the archive owner's bytes, and
            // a byte-identical rebuild is neither admitted nor copied again: the
            // one remaining copy is the upload's own.
            expect({
              preparedCopies,
              appliedCopies: copies.mock.calls.length,
              parses: facts.filter((fact) => fact.kind === "parse").length,
              admissions: count("axm.archive.admit"),
            }).toEqual({ preparedCopies: 0, appliedCopies: 1, parses: 1, admissions: 1 });
            expect(count("axm.archive.parse")).toBe(0);
            expect(count("axm.publish.validate-source")).toBe(1);
          } finally {
            copies.mockRestore();
            world.cleanup();
          }
        }),
    );
  }

  it.effect("admits a rebuild that differs from the prepared archive before refusing it", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({ settings: { hooks: { review: "workspace" } } });
      try {
        const packageDir = world.write("hook", { name: "review" });
        const ready = yield* world.provide(prepare(requestFor(world, { preview: false })));
        expect(ready._tag).toBe("Ready");
        if (ready._tag !== "Ready") return;
        // Contained on disk, so the walk keeps it; not a portable link target,
        // so archive admission refuses it.
        fs.symlinkSync("hook:sh", nodePath.join(packageDir, "src", "alias"));
        const result = yield* world.provide(previewOrApply(ready.candidate, apply));
        const failure = publishFailureOf(result);
        expect(failure.category).toBe("validation");
        expect(failure.detail).toBe(
          'Archive link target must be a relative contained path: "src/alias".',
        );
        expect(publishDocument(result).counts.published).toBe(0);
        expect(fs.existsSync(nodePath.join(world.target.root, "extensions"))).toBe(false);
      } finally {
        world.cleanup();
      }
    }),
  );
});
