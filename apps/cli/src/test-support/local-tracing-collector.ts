import * as http from "node:http";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const tracePayload = Schema.Struct({
  resourceSpans: Schema.Array(
    Schema.Struct({
      scopeSpans: Schema.Array(
        Schema.Struct({
          spans: Schema.Array(
            Schema.Struct({
              name: Schema.String,
              spanId: Schema.String,
              traceId: Schema.String,
              parentSpanId: Schema.optionalKey(Schema.String),
              attributes: Schema.Array(
                Schema.Struct({
                  key: Schema.String,
                  value: Schema.Record(Schema.String, Schema.Unknown),
                }),
              ),
              events: Schema.Array(Schema.Unknown),
              links: Schema.Array(Schema.Unknown),
              status: Schema.Struct({ code: Schema.Number }),
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
      const server = http.createServer((request, response) => {
        if (request.method !== "POST" || request.url !== "/v1/traces") {
          response.writeHead(404).end();
          return;
        }
        let body = "";
        request.on("data", (chunk: unknown) => {
          body += String(chunk);
        });
        request.on("end", () => {
          bodies.push(body);
          headers.push(request.headers);
          if (behavior === "stall") return;
          if (behavior === "redirect") {
            response.writeHead(307, { location: redirect ?? "/forbidden" }).end();
            return;
          }
          response.writeHead(behavior === "reject" ? 503 : 200, {
            "content-type": "application/json",
          });
          response.end("{}");
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
          bodies.flatMap((body) =>
            Schema.decodeUnknownSync(Schema.fromJsonString(tracePayload))(
              body,
            ).resourceSpans.flatMap((resource) =>
              resource.scopeSpans.flatMap((scope) => scope.spans),
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
