import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import { defineSpecification } from "@agentxm/specification-metadata";
import { withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

class ProductFailure extends Data.TaggedError("ProductFailure")<{ message: string }> {}

export const specification = defineSpecification({
  requirement: "cli/local-tracing-preserves-outcomes",
  title: "Local exporter failures cannot change the command outcome",
  statement:
    "Local tracing shall preserve the command's output, result, and exit status when export fails, flush on normal shutdown within a bounded timeout, and perform no additional product reads to enrich traces.",
  class: "quality",
  characteristic: "reliability",
  role: "experience",
  goals: ["safe-repetition", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Successful and failing Effects run through the real exporter against rejecting and stalled loopback collectors with the live clock.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local trace failure isolation", () => {
  for (const behavior of ["reject", "stall"] as const) {
    for (const fail of [false, true]) {
      it.live(`preserves ${fail ? "failure" : "success"} when the collector ${behavior}s`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            const receiver = yield* localTracingCollector(behavior);
            const failure = new ProductFailure({ message: "product failure" });
            let reads = 0;
            const output: string[] = [];
            const program = Effect.gen(function* () {
              reads += 1;
              output.push("product output");
              return fail ? yield* failure : { exitCode: 0, value: "result" };
            });
            const baseline = yield* Effect.exit(withLocalTracing(program, {}));
            const start = performance.now();
            const traced = yield* Effect.exit(
              withLocalTracing(program, { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint }),
            );
            expect(performance.now() - start).toBeLessThan(1500);
            expect(Exit.isSuccess(traced)).toBe(Exit.isSuccess(baseline));
            if (Exit.isSuccess(baseline) && Exit.isSuccess(traced))
              expect(traced.value).toEqual(baseline.value);
            if (Exit.isFailure(baseline) && Exit.isFailure(traced))
              expect(Cause.squash(traced.cause)).toBe(failure);
            expect(reads).toBe(2);
            expect(output).toEqual(["product output", "product output"]);
            expect(receiver.bodies.length).toBeGreaterThan(0);
          }),
        ),
      );
    }
  }
});
