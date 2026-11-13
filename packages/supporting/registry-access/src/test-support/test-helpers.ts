import * as Tracer from "effect/Tracer";

/** In-memory exporter boundary; independent service-port counters remain the work oracle. */
export const recordTrace = (started?: (span: Tracer.NativeSpan) => void) => {
  const spans: Array<Tracer.NativeSpan> = [];
  const endCounts = new Map<string, number>();
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      const end = span.end.bind(span);
      span.end = (time, exit) => {
        endCounts.set(span.spanId, (endCounts.get(span.spanId) ?? 0) + 1);
        end(time, exit);
      };
      spans.push(span);
      started?.(span);
      return span;
    },
  });
  return { tracer, spans, endCounts };
};
