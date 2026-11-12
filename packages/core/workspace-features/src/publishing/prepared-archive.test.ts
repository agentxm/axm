import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";
import { prepare, previewOrApply } from "./index.js";
import { makePublishWorld, publishDocument, requestFor } from "./test-helpers.js";

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
          const tracer = Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              spans.push(span);
              return span;
            },
          });
          const count = (name: string) => spans.filter((span) => span.name === name).length;
          try {
            world.write(type, { name: "review" });
            const ready = yield* world
              .provide(prepare(requestFor(world, { preview: false })))
              .pipe(Effect.withTracer(tracer), Effect.withTracerEnabled(true));
            expect(ready._tag).toBe("Ready");
            if (ready._tag !== "Ready") return;
            const candidate = ready.candidate.uploadCandidates[0];
            expect(candidate).toBeDefined();
            if (candidate === undefined) return;
            const original = candidate.archive.copyBytes();
            candidate.archive.copyBytes().fill(0);
            expect(count("axm.archive.parse")).toBe(1);
            expect(count("axm.archive.admit")).toBe(1);
            expect(count("axm.archive.decode-manifest")).toBe(1);
            const result = yield* world
              .provide(
                previewOrApply(
                  ready.candidate,
                  applyPlanExecution({
                    approval: "preapproved",
                    acceptedPolicies: new Set(),
                    recovery: { command: [], arguments: [] },
                  }),
                ),
              )
              .pipe(Effect.withTracer(tracer), Effect.withTracerEnabled(true));
            expect(publishDocument(result).counts.published).toBe(1);
            expect(
              new Uint8Array(
                world.archive("review", "1.0.0", type === "hook" ? "hooks" : "knowledge"),
              ),
            ).toEqual(original);
            expect(count("axm.archive.parse")).toBe(2);
            expect(count("axm.archive.admit")).toBe(2);
            expect(count("axm.publish.validate-source")).toBe(1);
          } finally {
            world.cleanup();
          }
        }),
    );
  }
});
