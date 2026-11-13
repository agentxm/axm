import * as http from "node:http";
import protobuf from "protobufjs";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

// Decode the OTLP fields asserted by these tests using their published wire numbers.
// Unknown fields remain forward compatible; this is a receiver, not an exporter double.
// AnyValue's oneof preserves explicit false/zero values instead of dropping scalar defaults.
const wireRoot = protobuf.parse(
  `
syntax = "proto3";
message LogsData { repeated ResourceLogs resourceLogs = 1; }
message ResourceLogs { Resource resource = 1; repeated ScopeLogs scopeLogs = 2; }
message ScopeLogs { repeated LogRecord logRecords = 2; }
message LogRecord { fixed64 timeUnixNano = 1; AnyValue body = 5; repeated KeyValue attributes = 6; bytes traceId = 9; bytes spanId = 10; }
message TraceData { repeated ResourceSpans resourceSpans = 1; }
message ResourceSpans { Resource resource = 1; repeated ScopeSpans scopeSpans = 2; }
message Resource { repeated KeyValue attributes = 1; }
message ScopeSpans { repeated Span spans = 2; }
message Span {
  bytes traceId = 1; bytes spanId = 2; bytes parentSpanId = 4; string name = 5;
  fixed64 startTimeUnixNano = 7; fixed64 endTimeUnixNano = 8;
  repeated KeyValue attributes = 9; repeated Event events = 11;
  repeated Link links = 13; Status status = 15;
}
message KeyValue { string key = 1; AnyValue value = 2; }
message AnyValue {
  oneof value { string stringValue = 1; bool boolValue = 2; int64 intValue = 3; double doubleValue = 4; }
}
message Event { string name = 2; }
message Link { bytes traceId = 1; }
message Status { string message = 2; int32 code = 3; }
`,
).root;
const wirePayload = wireRoot.lookupType("TraceData");
const wireLogs = wireRoot.lookupType("LogsData");

const tracePayload = Schema.Struct({
  resourceSpans: Schema.Array(
    Schema.Struct({
      resource: Schema.Struct({
        attributes: Schema.Array(
          Schema.Struct({
            key: Schema.String,
            value: Schema.Record(Schema.String, Schema.Unknown),
          }),
        ),
      }),
      scopeSpans: Schema.Array(
        Schema.Struct({
          spans: Schema.Array(
            Schema.Struct({
              name: Schema.String,
              spanId: Schema.Uint8Array,
              traceId: Schema.Uint8Array,
              startTimeUnixNano: Schema.Number,
              endTimeUnixNano: Schema.Number,
              parentSpanId: Schema.optionalKey(Schema.Uint8Array),
              attributes: Schema.Array(
                Schema.Struct({
                  key: Schema.String,
                  value: Schema.Record(Schema.String, Schema.Unknown),
                }),
              ),
              events: Schema.Array(Schema.Unknown),
              links: Schema.Array(Schema.Unknown),
              status: Schema.Struct({ code: Schema.optionalKey(Schema.Number) }),
            }),
          ),
        }),
      ),
    }),
  ),
});

const attributeSchema = Schema.Struct({
  key: Schema.String,
  value: Schema.Record(Schema.String, Schema.Unknown),
});
const logsPayload = Schema.Struct({
  resourceLogs: Schema.Array(
    Schema.Struct({
      resource: Schema.Struct({ attributes: Schema.Array(attributeSchema) }),
      scopeLogs: Schema.Array(
        Schema.Struct({
          logRecords: Schema.Array(
            Schema.Struct({
              body: Schema.Struct({ stringValue: Schema.String }),
              spanId: Schema.Uint8Array,
              traceId: Schema.Uint8Array,
              attributes: Schema.Array(attributeSchema),
            }),
          ),
        }),
      ),
    }),
  ),
});

/** Real loopback OTLP receiver; it never forwards a request or stores trace files. */
export const localTracingCollector = (
  behavior: "ok" | "reject" | "stall" | "redirect" = "ok",
  redirect?: string,
) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const bodies: string[] = [];
      const headers: http.IncomingHttpHeaders[] = [];
      const payloads: Uint8Array[] = [];
      const logPayloads: Uint8Array[] = [];
      const server = http.createServer((request, response) => {
        if (
          request.method !== "POST" ||
          (request.url !== "/v1/traces" && request.url !== "/v1/logs")
        ) {
          response.writeHead(404).end();
          return;
        }
        const chunks: Buffer[] = [];
        request.on("data", (chunk: unknown) => {
          if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        });
        request.on("end", () => {
          const body = Buffer.concat(chunks);
          (request.url === "/v1/logs" ? logPayloads : payloads).push(body);
          bodies.push(body.toString("utf8"));
          headers.push(request.headers);
          if (behavior === "stall") return;
          if (behavior === "redirect") {
            response.writeHead(307, { location: redirect ?? "/forbidden" }).end();
            return;
          }
          response.writeHead(behavior === "reject" ? 503 : 200, {
            "content-type": "application/x-protobuf",
          });
          response.end();
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Missing loopback listener");
      return {
        endpoint: `http://127.0.0.1:${address.port}/v1/traces`,
        bodies,
        headers,
        spans: () =>
          payloads.flatMap((body) =>
            Schema.decodeUnknownSync(tracePayload)(
              wirePayload.toObject(wirePayload.decode(body), {
                arrays: true,
                longs: Number,
              }),
            ).resourceSpans.flatMap((resource) =>
              resource.scopeSpans.flatMap((scope) =>
                scope.spans.map((span) => ({
                  ...span,
                  resource: resource.resource.attributes,
                  traceId: Buffer.from(span.traceId).toString("hex"),
                  spanId: Buffer.from(span.spanId).toString("hex"),
                  parentSpanId: span.parentSpanId?.length
                    ? Buffer.from(span.parentSpanId).toString("hex")
                    : undefined,
                })),
              ),
            ),
          ),
        logs: () =>
          logPayloads.flatMap((body) =>
            Schema.decodeUnknownSync(logsPayload)(
              wireLogs.toObject(wireLogs.decode(body), { arrays: true, longs: Number }),
            ).resourceLogs.flatMap((resource) =>
              resource.scopeLogs.flatMap((scope) =>
                scope.logRecords.map((record) => ({
                  name: record.body.stringValue,
                  traceId: Buffer.from(record.traceId).toString("hex"),
                  spanId: Buffer.from(record.spanId).toString("hex"),
                  attributes: record.attributes,
                  resource: resource.resource.attributes,
                })),
              ),
            ),
          ),
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.closeAllConnections();
            server.close((error) => (error === undefined ? resolve() : reject(error)));
          }),
      };
    }),
    (collector) => Effect.promise(collector.close),
  );
