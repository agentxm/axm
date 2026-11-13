import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";

/** Install once on the base transport, below authorization and retry composition. */
export const observedTransport = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transform(client, (response, request) =>
    response.pipe(
      Effect.tap((value) => Effect.annotateCurrentSpan("http.response.status_code", value.status)),
      Effect.withSpan(
        "axm.http.request",
        {
          kind: "client",
          attributes: { "http.request.method": request.method, "axm.work.executed": 1 },
        },
        { captureStackTrace: false },
      ),
    ),
  );
