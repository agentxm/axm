import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

export const specification = defineSpecification({
  requirement: "cli/local-tracing-identifies-invocations",
  title: "Local trace receipts identify the exact invocation",
  statement:
    "Explicitly requested local trace receipts shall identify the invocation's exported trace and validated build provenance, distinguish traced execution from runtime startup and export finalization, and preserve command output, outcome, existing files, and private inputs.",
  class: "quality",
  characteristic: "reliability",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Concurrent invocations write actual receipt files and export to a loopback OTLP receiver.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const receiptSchema = Schema.fromJsonString(
  Schema.Struct({
    service: Schema.Literal("axm"),
    traceId: Schema.String,
    spanId: Schema.String,
  }),
);
const temporaryDirectory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "axm-trace-"))),
  (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
);

describe("Local trace receipts", () => {
  it.live("correlates concurrent invocations with their exact exported root", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* temporaryDirectory;
        const receiver = yield* localTracingCollector();
        const paths = [join(directory, "first.json"), join(directory, "second.json")];
        yield* Effect.forEach(
          paths,
          (path) =>
            withLocalTracing(Effect.void, {
              AXM_TRACE: "1",
              AXM_TRACE_ENDPOINT: receiver.endpoint,
              AXM_TRACE_RECEIPT: path,
            }),
          { concurrency: 2 },
        );
        const receipts = yield* Effect.forEach(paths, (path) =>
          Effect.promise(() => readFile(path, "utf8")).pipe(
            Effect.map(Schema.decodeUnknownSync(receiptSchema)),
          ),
        );
        expect(new Set(receipts.map((receipt) => receipt.traceId)).size).toBe(2);
        for (const receipt of receipts) {
          expect(receipt.traceId).toMatch(/^[0-9a-f]{32}$/);
          expect(receiver.spans()).toContainEqual(
            expect.objectContaining({
              name: "axm.cli.invocation",
              traceId: receipt.traceId,
              spanId: receipt.spanId,
            }),
          );
        }
      }),
    ),
  );

  it.live("preserves existing files and operation outcomes when receipts cannot be written", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* temporaryDirectory;
        const path = join(directory, "existing");
        yield* Effect.promise(() => writeFile(path, "keep"));
        for (const receipt of [path, join(directory, "missing", "receipt.json")]) {
          expect(
            yield* withLocalTracing(Effect.succeed(42), {
              AXM_TRACE: "1",
              AXM_TRACE_ENDPOINT: "http://127.0.0.1:1/v1/traces",
              AXM_TRACE_RECEIPT: receipt,
            }),
          ).toBe(42);
        }
        expect(yield* Effect.promise(() => readFile(path, "utf8"))).toBe("keep");
      }),
    ),
  );
});
