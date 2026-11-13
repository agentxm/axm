import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import { TraceBuildSchema } from "./trace-build.js";
import { OperationPhaseSchema } from "@agentxm/workspace-kernel/operations";

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const TraceIdSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/));
export const TraceSpanIdSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{16}$/));
/** Shape is bounded here; the producer admits routes from the actual command tree. */
export const TraceCommandRouteSchema = Schema.String.check(
  Schema.isMaxLength(256),
  Schema.isPattern(/^(?:[a-z][a-z0-9-]*)(?: [a-z][a-z0-9-]*){0,5}$/),
);
const duration = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));
export const TraceTimingsSchema = Schema.Struct({
  startupMillis: duration,
  executionMillis: duration,
  runtimeElapsedAtExecutionEndMillis: duration,
  exportFinalizationMillis: duration,
});
export type TraceTimings = typeof TraceTimingsSchema.Type;

export const TraceDetailKindSchema = Schema.Literals([
  "io",
  "parse",
  "hash",
  "reuse",
  "native",
  "cache",
  "render",
]);
export type TraceDetailKind = typeof TraceDetailKindSchema.Type;
export const TraceDetailSelectionSchema = Schema.Struct({
  kinds: Schema.Array(TraceDetailKindSchema),
  phase: Schema.NullOr(OperationPhaseSchema),
}).check(
  Schema.makeFilter((selection) =>
    new Set(selection.kinds).size !== selection.kinds.length
      ? "Detail categories must be unique"
      : selection.kinds.length === 0 && selection.phase !== null
        ? "A detail phase requires a selected category"
        : undefined,
  ),
);
export type TraceDetailSelection = typeof TraceDetailSelectionSchema.Type;

export type TraceAggregateAttributes = ReadonlyMap<string, string | number | boolean>;

/** Values and ownership are integrity-protected; timestamps and receiver IDs are not facts. */
export const traceAggregateEventsSha256 = (
  records: ReadonlyArray<TraceAggregateAttributes>,
): string =>
  createHash("sha256")
    .update(
      records
        .map((attributes) =>
          JSON.stringify([
            "axm.work.summary",
            [...attributes].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
          ]),
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");

/** Producer accounting is separate from the product outcome and receiver retrieval. */
export const TraceReceiptSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  service: Schema.Literal("axm"),
  traceId: TraceIdSchema,
  spanId: TraceSpanIdSchema,
  mode: Schema.Literals(["summary", "detail"]),
  detailSelection: TraceDetailSelectionSchema,
  commandRoute: TraceCommandRouteSchema,
  build: TraceBuildSchema,
  timings: Schema.NullOr(TraceTimingsSchema),
  producerComplete: Schema.Boolean,
  retainedSpanCount: count,
  spanIdsSha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  aggregateEventCount: count,
  aggregateEventsSha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  droppedSpanCount: count,
  droppedAggregateEventCount: count,
  unrecognizedSpanCount: count,
  unrecognizedAttributeCount: count,
  summaryOverflowCount: count,
}).check(
  Schema.makeFilter((receipt) =>
    (receipt.mode === "summary") === (receipt.detailSelection.kinds.length === 0)
      ? undefined
      : "Capture mode must agree with the detail selection",
  ),
);

export type TraceReceipt = typeof TraceReceiptSchema.Type;

/** A requested receipt can describe why no trace identity was established. */
export const TraceCaptureStateSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  service: Schema.Literal("axm"),
  captureState: Schema.Literals(["starting", "disabled", "invalid-endpoint", "setup-failed"]),
});
export type TraceCaptureState = typeof TraceCaptureStateSchema.Type;
export const TraceReceiptDocumentSchema = Schema.Union([
  TraceReceiptSchema,
  TraceCaptureStateSchema,
]);
export type TraceReceiptDocument = typeof TraceReceiptDocumentSchema.Type;

/** Order-independent identity of the exact exported span set, without a trailing newline. */
export const traceSpanIdsSha256 = (spanIds: ReadonlyArray<string>): string =>
  createHash("sha256")
    .update([...spanIds].sort().join("\n"))
    .digest("hex");
