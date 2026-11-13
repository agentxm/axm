import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  isSummaryOwner,
  isDetailedTraceSpan,
  detailKindForWork,
  safeTraceAttribute,
  traceSpanNames,
  traceWorkCounterAttributes,
  TRACE_LIMITS,
} from "./local-trace-policy.js";
import {
  TraceReceiptDocumentSchema,
  TraceReceiptSchema,
  TraceIdSchema,
  TraceSpanIdSchema,
  traceSpanIdsSha256,
  traceAggregateEventsSha256,
  type TraceAggregateAttributes,
} from "./local-trace-receipt.js";

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const duration = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));
const dimension = Schema.Union([Schema.String, Schema.Boolean, count]);

/** Every Seq consumer retrieves the same identity and observation contract. */
export const traceRetrievalColumns = [
  "@Properties",
  "@Resource.service.name",
  "@Resource.service.version",
  "@Resource.axm.build.revision",
  "@Resource.axm.build.dirty",
  "@Resource.axm.execution.kind",
  "@Resource.process.runtime.name",
  "@Resource.process.runtime.version",
] as const;

/** Expectations come from the fixture or recorded external operations, never the trace being checked. */
export const TraceExpectationSchema = Schema.Struct({
  spans: Schema.optional(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        count,
        parentName: Schema.optional(Schema.String),
      }),
    ),
  ),
  work: Schema.optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.String,
        ownerName: Schema.optional(Schema.String),
        ownerAttributes: Schema.optional(Schema.Record(Schema.String, dimension)),
        dimensions: Schema.optional(Schema.Record(Schema.String, dimension)),
        count: Schema.optional(count),
        workCount: Schema.optional(count),
        requested: Schema.optional(count),
        executed: Schema.optional(count),
        reused: Schema.optional(count),
        bytes: Schema.optional(count),
        ioBytes: Schema.optional(count),
        archiveBytes: Schema.optional(count),
        archiveEntries: Schema.optional(count),
        batchItems: Schema.optional(count),
        registryBatchItems: Schema.optional(count),
        deniedItems: Schema.optional(count),
      }),
    ),
  ),
});
export type TraceExpectation = typeof TraceExpectationSchema.Type;

export class TraceEvidenceFailure extends Data.TaggedError("TraceEvidenceFailure")<{
  readonly code:
    | "invalid-input"
    | "export-disabled"
    | "invalid-endpoint"
    | "setup-failed"
    | "producer-incomplete"
    | "producer-loss"
    | "retrieval-incomplete"
    | "identity-mismatch"
    | "duplicate-span"
    | "topology-mismatch"
    | "selection-mismatch"
    | "invalid-summary"
    | "expectation-mismatch"
    | "traversal-limit"
    | "subtree-missing";
  readonly message: string;
}> {}

const treeSchema = Schema.Struct({
  traceId: Schema.String,
  complete: Schema.Boolean,
  root: Schema.Unknown,
});
const spanSchema = Schema.Struct({
  type: Schema.Literal("span"),
  spanId: TraceSpanIdSchema,
  parentSpanId: Schema.optional(TraceSpanIdSchema),
  message: Schema.String,
  elapsedMs: duration,
  columns: Schema.Record(Schema.String, Schema.Unknown),
  children: Schema.optional(Schema.Array(Schema.Unknown)),
});

const SEQ_TRACE_EVENT_LIMIT = 10_000;
const projectionColumns = [
  "traceId",
  "spanId",
  "parentSpanId",
  "isSpan",
  "message",
  "elapsedMs",
  ...traceRetrievalColumns.map((_, index) => `c${index}`),
];
const projectionRowSchema = Schema.Tuple([
  TraceIdSchema,
  TraceSpanIdSchema,
  Schema.NullOr(TraceSpanIdSchema),
  Schema.Boolean,
  Schema.String,
  Schema.NullOr(duration),
  Schema.Unknown,
  Schema.Unknown,
  Schema.Unknown,
  Schema.Unknown,
  Schema.Unknown,
  Schema.Unknown,
  Schema.Unknown,
  Schema.Unknown,
]);
const projectionSchema = Schema.Struct({
  Columns: Schema.Array(Schema.String),
  Rows: Schema.Array(Schema.Unknown),
  Error: Schema.optional(Schema.NullOr(Schema.String)),
});

/** The pinned tree command caps all events at 10k. Large admitted captures use
 * one explicit projection, not a truncated first query followed by another. */
export const traceRetrievalPlan = Effect.fnUntraced(function* (receiptInput: unknown) {
  const receipt = yield* Schema.decodeUnknownEffect(TraceReceiptSchema)(receiptInput).pipe(
    Effect.mapError(invalid),
  );
  if (
    receipt.retainedSpanCount < 1 ||
    receipt.retainedSpanCount > TRACE_LIMITS[receipt.mode] + 1 ||
    receipt.aggregateEventCount > TRACE_LIMITS.summaryGroups
  )
    return yield* new TraceEvidenceFailure({
      code: "producer-loss",
      message: "Producer event counts exceed the admitted capture limits.",
    });
  const expectedEvents = receipt.retainedSpanCount + receipt.aggregateEventCount;
  if (expectedEvents < SEQ_TRACE_EVENT_LIMIT)
    return {
      format: "tree",
      eventLimit: SEQ_TRACE_EVENT_LIMIT,
      args: [
        "trace",
        `--id=${receipt.traceId}`,
        "--json",
        "--logs",
        ...traceRetrievalColumns.map((column) => `--column=${column}`),
      ],
    } as const;
  const eventLimit = expectedEvents + 1;
  const query =
    "select @TraceId as traceId, @SpanId as spanId, @ParentId as parentSpanId, " +
    "Has(@Start) as isSpan, @Message as message, TotalMilliseconds(@Elapsed) as elapsedMs, " +
    traceRetrievalColumns.map((column, index) => `${column} as c${index}`).join(", ") +
    ` from stream where @TraceId = '${receipt.traceId}' limit ${eventLimit}`;
  return {
    format: "rows",
    eventLimit,
    args: ["query", "--json", "--timeout=15000", "--query", query],
  } as const;
});

interface ProjectedSpan {
  readonly type: "span";
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly message: string;
  readonly elapsedMs: number;
  readonly columns: Readonly<Record<string, unknown>>;
  readonly children: ProjectedNode[];
}
interface ProjectedLog {
  readonly type: "log";
  readonly spanId: string;
  readonly message: string;
  readonly columns: Readonly<Record<string, unknown>>;
}
type ProjectedNode = ProjectedSpan | ProjectedLog;

/** Fixed SeqQL projection only: validate every row and retain every node. Exact
 * receipt and aggregate integrity remain the existing inspector's responsibility. */
export const decodeTraceRetrieval = Effect.fnUntraced(function* (
  receiptInput: unknown,
  input: unknown,
): Effect.fn.Return<unknown, TraceEvidenceFailure> {
  const receipt = yield* Schema.decodeUnknownEffect(TraceReceiptSchema)(receiptInput).pipe(
    Effect.mapError(invalid),
  );
  const plan = yield* traceRetrievalPlan(receipt);
  if (plan.format === "tree") return input;
  const result = yield* Schema.decodeUnknownEffect(projectionSchema)(input).pipe(
    Effect.mapError(invalid),
  );
  if (
    (result.Error !== undefined && result.Error !== null && result.Error !== "") ||
    result.Rows.length >= plan.eventLimit
  )
    return yield* new TraceEvidenceFailure({
      code: "retrieval-incomplete",
      message: "The bounded Seq projection did not establish complete retrieval.",
    });
  if (JSON.stringify(result.Columns) !== JSON.stringify(projectionColumns)) return yield* invalid();
  const spans = new Map<string, ProjectedSpan>();
  const logs: ProjectedLog[] = [];
  for (const rowInput of result.Rows) {
    const [traceId, spanId, parentSpanId, isSpan, message, elapsedMs, ...projected] =
      yield* Schema.decodeUnknownEffect(projectionRowSchema)(rowInput).pipe(
        Effect.mapError(invalid),
      );
    if (traceId !== receipt.traceId)
      return yield* new TraceEvidenceFailure({
        code: "identity-mismatch",
        message: "A projected event belongs to another trace.",
      });
    const columns = Object.fromEntries(
      traceRetrievalColumns.map((column, index) => [column, projected[index]]),
    );
    if (!isSpan) {
      if (parentSpanId !== null || elapsedMs !== null) return yield* invalid();
      logs.push({ type: "log", spanId, message, columns });
      continue;
    }
    if (elapsedMs === null) return yield* invalid();
    if (spans.has(spanId))
      return yield* new TraceEvidenceFailure({
        code: "duplicate-span",
        message: "Seq returned a duplicate span identity.",
      });
    spans.set(spanId, {
      type: "span",
      spanId,
      ...(parentSpanId === null ? {} : { parentSpanId }),
      message,
      elapsedMs,
      columns,
      children: [],
    });
  }
  const root = spans.get(receipt.spanId);
  if (root === undefined || root.parentSpanId !== undefined)
    return yield* new TraceEvidenceFailure({
      code: "identity-mismatch",
      message: "The projected invocation root is absent or inconsistent.",
    });
  const topology = () =>
    new TraceEvidenceFailure({
      code: "topology-mismatch",
      message: "A projected event has a missing owner or inconsistent ancestry.",
    });
  for (const span of spans.values()) {
    if (span === root) continue;
    const parent = span.parentSpanId === undefined ? undefined : spans.get(span.parentSpanId);
    if (parent === undefined) return yield* topology();
    parent.children.push(span);
  }
  for (const log of logs) {
    const owner = spans.get(log.spanId);
    if (owner === undefined) return yield* topology();
    owner.children.push(log);
  }
  // A disconnected cycle must not disappear when projecting the sole root.
  const pending: ProjectedNode[] = [root];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const node = pending.pop();
    if (node?.type !== "span") continue;
    if (visited.has(node.spanId)) return yield* topology();
    visited.add(node.spanId);
    pending.push(...node.children);
  }
  if (visited.size !== spans.size) return yield* topology();
  return { traceId: receipt.traceId, complete: true, root };
});

const envelopeSchema = Schema.Struct({ type: Schema.String });
const logSchema = Schema.Struct({
  type: Schema.Literal("log"),
  spanId: TraceSpanIdSchema,
  message: Schema.String,
  columns: Schema.Record(Schema.String, Schema.Unknown),
});
const propertiesSchema = Schema.Record(Schema.String, Schema.Unknown);
type Attributes = ReadonlyMap<string, string | number | boolean>;
interface Span {
  readonly id: string;
  readonly parent: string | undefined;
  readonly name: string;
  readonly elapsedMs: number;
  readonly attributes: Attributes;
  readonly resource: Readonly<Record<string, unknown>>;
}
export interface TraceWorkSummary {
  readonly kind: string;
  readonly owner: string;
  readonly ownerName: string;
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly count: number;
  readonly workDurationMs: number | null;
  /** Known partial totals survive even when a convenient total remains unknown. */
  readonly measurements: Readonly<
    Record<
      string,
      {
        readonly total: number;
        readonly measured: number;
        readonly occurrences: number;
      }
    >
  >;
  /** Null means the producer did not measure every occurrence in this group. */
  readonly workCount: number | null;
  readonly requested: number | null;
  readonly executed: number | null;
  readonly reused: number | null;
  readonly bytes: number | null;
  readonly ioBytes: number | null;
  readonly archiveBytes: number | null;
  readonly archiveEntries: number | null;
  readonly batchItems: number | null;
  readonly registryBatchItems: number | null;
  readonly deniedItems: number | null;
}

const invalid = () =>
  new TraceEvidenceFailure({ code: "invalid-input", message: "Invalid trace evidence input." });

// Seq expands dotted OTel property names into nested objects. Only admitted scalar fields leave this boundary.
const summaryAttribute = (key: string, value: unknown): boolean => {
  if (key.startsWith("axm.measured."))
    return (
      traceWorkCounterAttributes.has(`axm.${key.slice("axm.measured.".length)}`) &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
    );
  switch (key) {
    case "axm.summary.schema-version":
      return value === 1;
    case "axm.summary.kind":
      return (
        typeof value === "string" &&
        traceSpanNames.has(value) &&
        value !== "axm.work.summary" &&
        value !== "axm.cli.invocation"
      );
    case "axm.summary.owner":
      return Schema.is(TraceSpanIdSchema)(value);
    case "axm.summary.count":
      return Schema.is(count)(value) && value > 0;
    case "axm.summary.work-duration-us":
    case "axm.summary.duration-measured":
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    default:
      return false;
  }
};

const flattenProperties = (
  input: unknown,
  isSummary: boolean,
  commandRoutes: ReadonlySet<string>,
): Effect.Effect<Attributes, TraceEvidenceFailure> =>
  Effect.gen(function* () {
    const properties = yield* Schema.decodeUnknownEffect(propertiesSchema)(input).pipe(
      Effect.mapError(invalid),
    );
    const result = new Map<string, string | number | boolean>();
    const pending = Object.entries(properties).map(([key, value]) => ({ key, value, depth: 0 }));
    let visited = 0;
    while (pending.length > 0) {
      const item = pending.pop();
      if (item === undefined) break;
      if (++visited > 512 || item.depth > 12) return yield* invalid();
      const { key, value } = item;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        if (
          safeTraceAttribute(key, value, commandRoutes) ||
          (isSummary && summaryAttribute(key, value))
        ) {
          result.set(key, value);
        }
      } else if (Schema.is(propertiesSchema)(value)) {
        for (const [child, nested] of Object.entries(value))
          pending.push({ key: `${key}.${child}`, value: nested, depth: item.depth + 1 });
      }
    }
    return result;
  });

const numeric = (attributes: Attributes, key: string) => {
  const value = attributes.get(key);
  return typeof value === "number" ? value : null;
};
const workFields = [
  "count",
  "workCount",
  "requested",
  "executed",
  "reused",
  "bytes",
  "ioBytes",
  "archiveBytes",
  "archiveEntries",
  "batchItems",
  "registryBatchItems",
  "deniedItems",
] as const;

/** Verify complete invocation evidence before optionally selecting a presentation subtree. */
export const inspectLocalTrace = Effect.fnUntraced(function* (
  receiptInput: unknown,
  treeInput: unknown,
  options: {
    readonly expected?: unknown;
    readonly spanId?: string;
    readonly maxNodes?: number;
  } = {},
) {
  const receipt = yield* Schema.decodeUnknownEffect(TraceReceiptDocumentSchema)(receiptInput).pipe(
    Effect.mapError(invalid),
  );
  if ("captureState" in receipt)
    return yield* new TraceEvidenceFailure({
      code:
        receipt.captureState === "starting"
          ? "producer-incomplete"
          : receipt.captureState === "disabled"
            ? "export-disabled"
            : receipt.captureState,
      message:
        receipt.captureState === "starting"
          ? "The capture began but never established a trace identity."
          : receipt.captureState === "disabled"
            ? "Local trace export was disabled for this invocation."
            : receipt.captureState === "invalid-endpoint"
              ? "The requested local trace endpoint was not admitted."
              : "Local trace exporter setup failed before execution.",
    });
  if (!receipt.producerComplete || receipt.timings === null)
    return yield* new TraceEvidenceFailure({
      code: "producer-incomplete",
      message: "The producer has not completed its accounting.",
    });
  if (
    receipt.droppedSpanCount !== 0 ||
    receipt.droppedAggregateEventCount !== 0 ||
    receipt.unrecognizedSpanCount !== 0 ||
    receipt.unrecognizedAttributeCount !== 0 ||
    receipt.summaryOverflowCount !== 0
  )
    return yield* new TraceEvidenceFailure({
      code: "producer-loss",
      message: "The producer reported dropped, unrecognized, or unaccounted work.",
    });
  const tree = yield* Schema.decodeUnknownEffect(treeSchema)(treeInput).pipe(
    Effect.mapError(invalid),
  );
  if (!tree.complete)
    return yield* new TraceEvidenceFailure({
      code: "retrieval-incomplete",
      message: "Seq returned an incomplete trace tree.",
    });
  if (tree.traceId !== receipt.traceId)
    return yield* new TraceEvidenceFailure({
      code: "identity-mismatch",
      message: "Trace identity does not match the producer receipt.",
    });
  const maxNodes = options.maxNodes ?? 100_000;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 100_000)
    return yield* invalid();
  const spans = new Map<string, Span>();
  const aggregates: Array<{
    attributes: TraceAggregateAttributes;
    owner: string;
    parent: string | undefined;
    resource: Readonly<Record<string, unknown>>;
  }> = [];
  // Receiver enrichment cannot expand the producer's admitted command identity.
  const commandRoutes = new Set([receipt.commandRoute, "unresolved"]);
  const pending: Array<{ input: unknown; parent: string | undefined }> = [
    { input: tree.root, parent: undefined },
  ];
  let visited = 0;
  let logCount = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    if (++visited > maxNodes)
      return yield* new TraceEvidenceFailure({
        code: "traversal-limit",
        message: "Trace traversal exceeded the configured node limit.",
      });
    const envelope = yield* Schema.decodeUnknownEffect(envelopeSchema)(item.input).pipe(
      Effect.mapError(invalid),
    );
    if (envelope.type === "log") {
      logCount += 1;
      const label = yield* Schema.decodeUnknownEffect(Schema.Struct({ message: Schema.String }))(
        item.input,
      ).pipe(Effect.mapError(invalid));
      if (label.message !== "axm.work.summary") continue;
      const log = yield* Schema.decodeUnknownEffect(logSchema)(item.input).pipe(
        Effect.mapError(invalid),
      );
      aggregates.push({
        attributes: yield* flattenProperties(log.columns["@Properties"], true, commandRoutes),
        owner: log.spanId,
        parent: item.parent,
        resource: log.columns,
      });
      continue;
    }
    const node = yield* Schema.decodeUnknownEffect(spanSchema)(item.input).pipe(
      Effect.mapError(invalid),
    );
    if (spans.has(node.spanId))
      return yield* new TraceEvidenceFailure({
        code: "duplicate-span",
        message: "Seq returned a duplicate span identity.",
      });
    if (
      node.parentSpanId !== item.parent ||
      !traceSpanNames.has(node.message) ||
      node.message === "axm.work.summary"
    )
      return yield* new TraceEvidenceFailure({
        code: "topology-mismatch",
        message: "The trace contains an unknown span or inconsistent parent relationship.",
      });
    const attributes = yield* flattenProperties(node.columns["@Properties"], false, commandRoutes);
    spans.set(node.spanId, {
      id: node.spanId,
      parent: item.parent,
      name: node.message,
      elapsedMs: node.elapsedMs,
      attributes,
      resource: node.columns,
    });
    for (const child of node.children ?? []) pending.push({ input: child, parent: node.spanId });
  }
  const root = spans.get(receipt.spanId);
  if (
    root === undefined ||
    root.parent !== undefined ||
    root.name !== "axm.cli.invocation" ||
    root.attributes.get("axm.command.route") !== receipt.commandRoute ||
    root.resource["@Resource.service.name"] !== receipt.service ||
    root.resource["@Resource.service.version"] !== receipt.build.version ||
    root.resource["@Resource.axm.build.revision"] !== receipt.build.revision ||
    root.resource["@Resource.axm.build.dirty"] !== receipt.build.dirty ||
    root.resource["@Resource.axm.execution.kind"] !== receipt.build.execution ||
    root.resource["@Resource.process.runtime.name"] !== receipt.build.runtime ||
    root.resource["@Resource.process.runtime.version"] !== receipt.build.runtimeVersion ||
    spans.size !== receipt.retainedSpanCount ||
    traceSpanIdsSha256([...spans.keys()]) !== receipt.spanIdsSha256
  )
    return yield* new TraceEvidenceFailure({
      code: "identity-mismatch",
      message: "The received span set does not match the completed producer receipt.",
    });

  for (const span of spans.values()) {
    if (!isDetailedTraceSpan(span.name)) continue;
    let phaseMatched = receipt.detailSelection.phase === null;
    let parent = span.parent;
    while (!phaseMatched && parent !== undefined) {
      const ancestor = spans.get(parent);
      phaseMatched =
        ancestor?.attributes.get("axm.operation.phase") === receipt.detailSelection.phase;
      parent = ancestor?.parent;
    }
    if (!receipt.detailSelection.kinds.includes(detailKindForWork(span.name)) || !phaseMatched)
      return yield* new TraceEvidenceFailure({
        code: "selection-mismatch",
        message: "A primitive span is outside the declared detail categories or phase ancestry.",
      });
  }

  const work: Array<TraceWorkSummary> = [];
  const groups = new Set<string>();
  const invalidSummary = () =>
    new TraceEvidenceFailure({
      code: "invalid-summary",
      message: "Work aggregates have invalid facts, coverage, or ownership.",
    });
  for (const aggregate of aggregates) {
    const attributes = aggregate.attributes;
    const kind = attributes.get("axm.summary.kind");
    const owner = attributes.get("axm.summary.owner");
    const count = attributes.get("axm.summary.count");
    const durationMeasured = numeric(attributes, "axm.summary.duration-measured");
    const durationUs = numeric(attributes, "axm.summary.work-duration-us");
    if (
      attributes.get("axm.summary.schema-version") !== 1 ||
      typeof kind !== "string" ||
      !traceSpanNames.has(kind) ||
      kind === "axm.work.summary" ||
      kind === "axm.cli.invocation" ||
      typeof owner !== "string" ||
      !spans.has(owner) ||
      !isSummaryOwner(spans.get(owner)?.name ?? "") ||
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      durationMeasured === null ||
      durationMeasured > count ||
      (durationMeasured === 0 ? durationUs !== null : durationUs === null) ||
      aggregate.parent !== owner ||
      aggregate.owner !== owner
    )
      return yield* invalidSummary();
    const resource = aggregate.resource;
    if (traceRetrievalColumns.slice(1).some((key) => resource[key] !== root.resource[key]))
      return yield* new TraceEvidenceFailure({
        code: "identity-mismatch",
        message: "Aggregate resource identity does not match its invocation.",
      });
    const dimensions: Record<string, string | number | boolean> = {};
    for (const [key, value] of attributes) {
      if (
        !key.startsWith("axm.summary.") &&
        (typeof value === "string" ||
          typeof value === "boolean" ||
          (key === "axm.admission.capacity" && typeof value === "number"))
      )
        dimensions[key] = value;
    }
    const group = JSON.stringify([
      owner,
      kind,
      Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    if (groups.has(group)) return yield* invalidSummary();
    groups.add(group);
    const measurements: Record<string, { total: number; measured: number; occurrences: number }> =
      {};
    if (durationUs !== null)
      measurements["axm.summary.work-duration-us"] = {
        total: durationUs,
        measured: durationMeasured,
        occurrences: count,
      };
    for (const key of traceWorkCounterAttributes) {
      const total = numeric(attributes, key);
      const measured = numeric(attributes, `axm.measured.${key.slice("axm.".length)}`);
      if (total === null && measured === null) continue;
      if (
        total === null ||
        measured === null ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        measured < 1 ||
        measured > count
      )
        return yield* invalidSummary();
      measurements[key] = { total, measured, occurrences: count };
    }
    const completeTotal = (key: string): number | null => {
      const measurement = measurements[key];
      return measurement?.measured === count ? measurement.total : null;
    };
    work.push({
      kind,
      owner,
      ownerName: spans.get(owner)?.name ?? "",
      count,
      dimensions,
      measurements,
      workDurationMs: durationMeasured === count && durationUs !== null ? durationUs / 1000 : null,
      workCount: completeTotal("axm.work.count"),
      requested: completeTotal("axm.work.requested"),
      executed: completeTotal("axm.work.executed"),
      reused: completeTotal("axm.work.reused-count"),
      bytes: completeTotal("axm.work.bytes"),
      ioBytes: completeTotal("axm.io.bytes"),
      archiveBytes: completeTotal("axm.archive.bytes"),
      archiveEntries: completeTotal("axm.archive.entries"),
      batchItems: completeTotal("axm.batch.count"),
      registryBatchItems: completeTotal("axm.registry.batch-size"),
      deniedItems: completeTotal("axm.registry.denied"),
    });
  }
  if (work.length > TRACE_LIMITS.summaryGroups) return yield* invalidSummary();
  if (
    aggregates.length !== receipt.aggregateEventCount ||
    traceAggregateEventsSha256(aggregates.map((aggregate) => aggregate.attributes)) !==
      receipt.aggregateEventsSha256
  )
    return yield* new TraceEvidenceFailure({
      code: "identity-mismatch",
      message: "The received aggregate facts do not match the completed producer receipt.",
    });

  if (options.expected !== undefined) {
    const observedRoutes = new Set(
      [...spans.values()].flatMap((span) => {
        const route = span.attributes.get("axm.command.route");
        return typeof route === "string" ? [route] : [];
      }),
    );
    const expected = yield* Schema.decodeUnknownEffect(TraceExpectationSchema)(
      options.expected,
    ).pipe(Effect.mapError(invalid));
    if ((expected.spans?.length ?? 0) + (expected.work?.length ?? 0) === 0) return yield* invalid();
    for (const expectation of expected.spans ?? []) {
      if (
        !traceSpanNames.has(expectation.name) ||
        (expectation.parentName !== undefined && !traceSpanNames.has(expectation.parentName))
      )
        return yield* invalid();
      const matching = [...spans.values()].filter((span) => span.name === expectation.name);
      if (
        matching.length !== expectation.count ||
        (expectation.parentName !== undefined &&
          matching.some(
            (span) =>
              span.parent === undefined || spans.get(span.parent)?.name !== expectation.parentName,
          ))
      )
        return yield* new TraceEvidenceFailure({
          code: "expectation-mismatch",
          message: "Observed span counts or ownership differ from the independent expectation.",
        });
    }
    for (const expectation of expected.work ?? []) {
      if (
        !traceSpanNames.has(expectation.kind) ||
        (expectation.ownerName !== undefined && !isSummaryOwner(expectation.ownerName)) ||
        Object.entries(expectation.ownerAttributes ?? {}).some(
          ([key, value]) => !safeTraceAttribute(key, value, observedRoutes),
        ) ||
        Object.entries(expectation.dimensions ?? {}).some(
          ([key, value]) => !safeTraceAttribute(key, value, observedRoutes),
        ) ||
        !workFields.some((key) => expectation[key] !== undefined)
      )
        return yield* invalid();
      const matching: TraceWorkSummary[] = [];
      for (const row of work) {
        if (
          row.kind !== expectation.kind ||
          (expectation.ownerName !== undefined && row.ownerName !== expectation.ownerName)
        )
          continue;
        const selectors = [
          ...Object.entries(expectation.ownerAttributes ?? {}).map(([key, expected]) => ({
            expected,
            actual: spans.get(row.owner)?.attributes.get(key),
          })),
          ...Object.entries(expectation.dimensions ?? {}).map(([key, expected]) => ({
            expected,
            actual: row.dimensions[key],
          })),
        ];
        // A known contradictory dimension excludes a row. Missing dimensions
        // cannot establish absence of work, even when the expected total is zero.
        if (selectors.some(({ actual, expected }) => actual !== undefined && actual !== expected))
          continue;
        if (selectors.some(({ actual }) => actual === undefined))
          return yield* new TraceEvidenceFailure({
            code: "expectation-mismatch",
            message: "A required work or ownership dimension was not measured.",
          });
        matching.push(row);
      }
      for (const key of workFields) {
        if (
          expectation[key] !== undefined &&
          (matching.some((row) => row[key] === null) ||
            matching.reduce((total, row) => total + (row[key] ?? 0), 0) !== expectation[key])
        )
          return yield* new TraceEvidenceFailure({
            code: "expectation-mismatch",
            message: "Observed work differs from the independent expectation.",
          });
      }
    }
  }
  const selected = options.spanId ?? root.id;
  if (!spans.has(selected))
    return yield* new TraceEvidenceFailure({
      code: "subtree-missing",
      message: "The requested subtree is absent from the verified invocation.",
    });
  const inScope = (id: string): boolean => {
    let current: string | undefined = id;
    while (current !== undefined) {
      if (current === selected) return true;
      current = spans.get(current)?.parent;
    }
    return false;
  };
  const selectedSpans = [...spans.values()].filter((span) => inScope(span.id));
  const selectedWork = work
    .filter((row) => inScope(row.owner))
    .sort(
      (left, right) => left.kind.localeCompare(right.kind) || left.owner.localeCompare(right.owner),
    );
  const describe = (span: Span) => ({
    spanId: span.id,
    parentSpanId: span.parent,
    name: span.name,
    elapsedMs: span.elapsedMs,
    attributes: Object.fromEntries(span.attributes),
  });
  return {
    schemaVersion: 2,
    traceId: receipt.traceId,
    rootSpanId: receipt.spanId,
    mode: receipt.mode,
    detailSelection: receipt.detailSelection,
    build: receipt.build,
    timings: receipt.timings,
    evidence: {
      producerComplete: true,
      retrievalComplete: true,
      spanIdentityVerified: true,
      aggregateIdentityVerified: true,
      detailCoverage: "selected-span-delivery-only",
      aggregateEventCount: aggregates.length,
      retainedSpanCount: spans.size,
      retainedDetailSpanCount: [...spans.values()].filter((span) => isDetailedTraceSpan(span.name))
        .length,
      logCount,
      expectations: options.expected === undefined ? "not-supplied" : "verified",
    },
    scope: { kind: selected === root.id ? "invocation" : "subtree", spanId: selected },
    invocation: {
      service: receipt.service,
      version: receipt.build.version,
      elapsedMs: root.elapsedMs,
      attributes: Object.fromEntries(root.attributes),
    },
    phases: selectedSpans
      .filter(
        (span) => span.name === "axm.operation.phase" || span.name === "axm.observation.phase",
      )
      .map(describe),
    waits: selectedSpans
      .filter(
        (span) =>
          span.name.startsWith("axm.wait.") ||
          span.name.endsWith("-wait") ||
          span.name === "axm.operation.wait",
      )
      .map(describe),
    cacheMaintenance: selectedSpans
      .filter((span) => span.name === "axm.archive.cache-prune")
      .map(describe),
    work: selectedWork,
  };
});
