import {
  traceSpanIdsSha256,
  traceAggregateEventsSha256,
  type TraceReceipt,
  type TraceTimings,
  type TraceDetailSelection,
  type TraceAggregateAttributes,
} from "./local-trace-receipt.js";
import type { WorkObserver } from "@agentxm/host-primitives/work-observation";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Tracer from "effect/Tracer";
import type { TraceBuild } from "./trace-build.js";
import {
  isDetailedTraceSpan,
  detailKindForWork,
  isSummaryOwner,
  isOwnedTraceSpan,
  safeTraceAttribute,
  traceSpanNames,
  traceWorkCounterAttributes,
  TRACE_LIMITS,
} from "./local-trace-policy.js";

type Attribute = string | number | boolean;
interface WorkSummary {
  readonly name: string;
  readonly owner: string;
  readonly dimensions: ReadonlyArray<readonly [string, Attribute]>;
  readonly counters: Map<string, { total: number; measured: number }>;
  count: number;
  durationMicros: number;
  durationMeasured: number;
}
export interface TraceAggregateRecord {
  readonly parent: Tracer.AnySpan;
  readonly attributes: TraceAggregateAttributes;
}
const failureKind = (cause: Cause.Cause<unknown>): string => {
  if (Cause.hasInterruptsOnly(cause)) return "interrupted";
  if (Cause.hasDies(cause)) return "defect";
  const error = Cause.squash(cause);
  if (Cause.isTimeoutError(error)) return "timeout";
  if (PlatformError.isPlatformError(error)) {
    if (error.reason._tag === "NotFound") return "not-found";
    if (error.reason._tag === "PermissionDenied") return "denied";
    if (error.reason._tag === "TimedOut") return "timeout";
  }
  return "failure";
};

/** One invocation owns direct accounting and admission, never a global metric registry. */
export const makeLocalTraceSession = (
  exporter: Tracer.Tracer,
  detailSelection: TraceDetailSelection,
  commandRoutes: ReadonlySet<string>,
  build: TraceBuild,
) => {
  const mode = detailSelection.kinds.length === 0 ? "summary" : "detail";
  const parents = new WeakMap<Tracer.AnySpan, Option.Option<Tracer.AnySpan>>();
  const summaryOwners = new WeakMap<Tracer.AnySpan, string>();
  const semanticKinds = new WeakMap<Tracer.AnySpan, string>();
  const ownerSpans = new Map<string, Tracer.AnySpan>();
  const summaries = new Map<string, WorkSummary>();
  const endedIds = new Set<string>();
  const aggregates: TraceAggregateRecord[] = [];
  let retained = 0;
  let droppedSpanCount = 0;
  let droppedAggregateEventCount = 0;
  let unrecognizedSpanCount = 0;
  let unrecognizedAttributeCount = 0;
  let summaryOverflowCount = 0;
  let producerComplete = false;
  let rootEnded = false;
  let activeSpanCount = 0;
  let activeWorkCount = 0;
  let traceId = "";
  let spanId = "";
  let commandRoute = "unresolved";
  const snapshot = (timings: TraceTimings | null = null): TraceReceipt => ({
    schemaVersion: 2,
    service: "axm",
    traceId,
    spanId,
    mode,
    detailSelection,
    commandRoute,
    build,
    timings,
    producerComplete,
    retainedSpanCount: endedIds.size,
    spanIdsSha256: traceSpanIdsSha256([...endedIds]),
    aggregateEventCount: aggregates.length,
    aggregateEventsSha256: traceAggregateEventsSha256(
      aggregates.map((record) => record.attributes),
    ),
    droppedSpanCount,
    droppedAggregateEventCount,
    unrecognizedSpanCount,
    unrecognizedAttributeCount,
    summaryOverflowCount,
  });
  const record = (
    name: string,
    attributes: Iterable<readonly [string, unknown]>,
    outcome: string,
    durationMillis: number | undefined,
    parent: Tracer.AnySpan | undefined,
  ) => {
    if (rootEnded) {
      droppedAggregateEventCount += 1;
      producerComplete = false;
      return;
    }
    const owner = parent === undefined ? spanId : (summaryOwners.get(parent) ?? spanId);
    const dimensions: Array<readonly [string, Attribute]> = [
      [
        "axm.work.owner",
        parent === undefined
          ? "axm.cli.invocation"
          : (semanticKinds.get(parent) ?? "axm.cli.invocation"),
      ],
      ["axm.outcome", outcome],
    ];
    const counters: Array<readonly [string, number]> = [];
    for (const [key, value] of attributes) {
      if (!safeTraceAttribute(key, value, commandRoutes)) {
        if (key.startsWith("axm.")) unrecognizedAttributeCount += 1;
        continue;
      }
      if (key === "axm.outcome" || key === "axm.work.owner") continue;
      if (typeof value === "string" || typeof value === "boolean") dimensions.push([key, value]);
      else if (typeof value === "number" && traceWorkCounterAttributes.has(key))
        counters.push([key, value]);
    }
    dimensions.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const key = JSON.stringify([name, owner, dimensions]);
    let summary = summaries.get(key);
    if (summary === undefined) {
      if (summaries.size >= TRACE_LIMITS.summaryGroups) {
        summaryOverflowCount += 1;
        return;
      }
      summary = {
        name,
        owner,
        dimensions,
        counters: new Map(),
        count: 0,
        durationMicros: 0,
        durationMeasured: 0,
      };
      summaries.set(key, summary);
    }
    summary.count += 1;
    if (durationMillis !== undefined && Number.isFinite(durationMillis) && durationMillis >= 0) {
      summary.durationMicros += Math.round(durationMillis * 1000);
      summary.durationMeasured += 1;
    }
    for (const [key, value] of counters) {
      const previous = summary.counters.get(key) ?? { total: 0, measured: 0 };
      const total = previous.total + value;
      if (!Number.isSafeInteger(total)) {
        summaryOverflowCount += 1;
        continue;
      }
      summary.counters.set(key, { total, measured: previous.measured + 1 });
    }
  };
  const observer: WorkObserver = {
    started: () => {
      if (rootEnded) {
        droppedAggregateEventCount += 1;
        producerComplete = false;
      }
      activeWorkCount += 1;
      return () => {
        activeWorkCount -= 1;
      };
    },
    record: (fact, parent) =>
      record(fact.kind, Object.entries(fact.attributes), fact.outcome, fact.durationMillis, parent),
    detailSelected(kind, parent) {
      if (!detailSelection.kinds.includes(detailKindForWork(kind))) return false;
      if (detailSelection.phase === null) return true;
      let current = parent;
      while (current !== undefined) {
        if (
          current._tag === "Span" &&
          current.attributes.get("axm.operation.phase") === detailSelection.phase
        )
          return true;
        current = current._tag === "Span" ? Option.getOrUndefined(current.parent) : undefined;
      }
      return false;
    },
  };
  const tracer = Tracer.make({
    span(options) {
      const parent = Option.flatMap(
        options.parent,
        (value) => parents.get(value) ?? Option.some(value),
      );
      if (!traceSpanNames.has(options.name)) {
        if (isOwnedTraceSpan(options.name)) unrecognizedSpanCount += 1;
        const ignored = new Tracer.NativeSpan({ ...options, parent });
        parents.set(ignored, parent);
        if (Option.isSome(options.parent)) {
          summaryOwners.set(ignored, summaryOwners.get(options.parent.value) ?? spanId);
          semanticKinds.set(
            ignored,
            semanticKinds.get(options.parent.value) ?? "axm.cli.invocation",
          );
        }
        return ignored;
      }
      const isRoot = options.name === "axm.cli.invocation";
      const detailed = isDetailedTraceSpan(options.name);
      const selected = isRoot || retained < TRACE_LIMITS[mode];
      if (!isRoot && !selected) droppedSpanCount += 1;
      if (selected && !isRoot) retained += 1;
      let delegate: Tracer.Span;
      try {
        delegate = selected
          ? exporter.span({ ...options, parent, annotations: Context.empty(), links: [] })
          : new Tracer.NativeSpan({ ...options, parent, annotations: Context.empty(), links: [] });
      } catch {
        droppedSpanCount += 1;
        delegate = new Tracer.NativeSpan({
          ...options,
          parent,
          annotations: Context.empty(),
          links: [],
        });
      }
      if (isRoot) {
        traceId = delegate.traceId;
        spanId = delegate.spanId;
      }
      activeSpanCount += 1;
      let ended = false;
      const span: Tracer.Span = {
        _tag: "Span",
        name: delegate.name,
        parent,
        annotations: Context.empty(),
        kind: delegate.kind,
        sampled: delegate.sampled,
        traceId: delegate.traceId,
        spanId: delegate.spanId,
        get status() {
          return delegate.status;
        },
        get attributes() {
          return new Map(delegate.attributes);
        },
        links: [],
        attribute(key, value) {
          if (safeTraceAttribute(key, value, commandRoutes)) {
            delegate.attribute(key, value);
            if (isRoot && key === "axm.command.route" && typeof value === "string")
              commandRoute = value;
          } else if (key.startsWith("axm.")) unrecognizedAttributeCount += 1;
        },
        event: () => undefined,
        addLinks: () => undefined,
        end(time, exit) {
          if (ended) return;
          ended = true;
          activeSpanCount -= 1;
          try {
            if (Exit.isFailure(exit) || !delegate.attributes.has("axm.outcome"))
              delegate.attribute(
                "axm.outcome",
                Exit.isSuccess(exit)
                  ? "success"
                  : Cause.hasInterruptsOnly(exit.cause)
                    ? "interrupted"
                    : "failure",
              );
            if (Exit.isFailure(exit) && !delegate.attributes.has("axm.failure.kind"))
              delegate.attribute("axm.failure.kind", failureKind(exit.cause));
            // Selected primitive spans describe intervals; their recorder alone owns the facts.
            if (!isRoot && !detailed)
              record(
                options.name,
                delegate.attributes,
                String(delegate.attributes.get("axm.outcome")),
                Number(time - options.startTime) / 1_000_000,
                Option.getOrUndefined(options.parent),
              );
            if (isRoot) {
              for (const summary of summaries.values()) {
                const owner = ownerSpans.get(summary.owner);
                if (owner === undefined) {
                  droppedAggregateEventCount += 1;
                  continue;
                }
                const attributes = new Map<string, Attribute>(summary.dimensions);
                attributes.set("axm.summary.schema-version", 1);
                attributes.set("axm.summary.kind", summary.name);
                attributes.set("axm.summary.owner", summary.owner);
                attributes.set("axm.summary.count", summary.count);
                attributes.set("axm.summary.duration-measured", summary.durationMeasured);
                if (summary.durationMeasured > 0)
                  attributes.set("axm.summary.work-duration-us", summary.durationMicros);
                for (const [key, value] of summary.counters) {
                  attributes.set(key, value.total);
                  attributes.set("axm.measured." + key.slice(4), value.measured);
                }
                aggregates.push({ parent: owner, attributes });
              }
              rootEnded = true;
              producerComplete = activeSpanCount === 0 && activeWorkCount === 0;
            }
            delegate.end(time, Exit.void);
            if (selected) endedIds.add(delegate.spanId);
          } catch {
            droppedSpanCount += 1;
            producerComplete = false;
          }
        },
      };
      parents.set(span, selected ? Option.some(span) : parent);
      const owner =
        selected && isSummaryOwner(span.name)
          ? span.spanId
          : Option.isSome(options.parent)
            ? (summaryOwners.get(options.parent.value) ?? spanId)
            : spanId;
      summaryOwners.set(span, owner);
      if (selected && isSummaryOwner(span.name)) ownerSpans.set(span.spanId, span);
      semanticKinds.set(
        span,
        !detailed
          ? span.name
          : Option.isSome(options.parent)
            ? (semanticKinds.get(options.parent.value) ?? "axm.cli.invocation")
            : "axm.cli.invocation",
      );
      return span;
    },
  });
  return {
    tracer,
    observer,
    snapshot,
    aggregates: () => aggregates,
    aggregateEmissionFailed: () => {
      droppedAggregateEventCount += 1;
    },
  };
};
