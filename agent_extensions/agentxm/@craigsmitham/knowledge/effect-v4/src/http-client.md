---
type: Guide
title: HTTP client
description: Calling HTTP services you do not define with the `effect/unstable/http` HttpClient; use for choosing and providing a client, request policy and construction, transient retry, schema-decoded responses, and swapping the client in tests.
tags: [effect, effect-v4, http-client, fetch, requests, retry, decoding, outbound, testing]
status: stable
sources:
  - id: docs-http-client-basics
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/50_http-client/10_basics.ts
    title: Official Effect docs — HttpClient service with mapRequest, filterStatusOk, retryTransient, schema decode (effect 4.0.0-rc.111)
  - id: src-http-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/http/HttpClient.ts
    title: HttpClient source — service key, transforms, retryTransient transient set, make (effect 4.0.0-rc.111)
  - id: src-http-client-request
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/http/HttpClientRequest.ts
    title: HttpClientRequest source — constructors, prependUrl, auth, body encoders (effect 4.0.0-rc.111)
  - id: src-fetch-http-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/http/FetchHttpClient.ts
    title: FetchHttpClient source — layer, Fetch reference, RequestInit service (effect 4.0.0-rc.111)
  - id: src-http-client-error
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/http/HttpClientError.ts
    title: HttpClientError source — one tagged error with a reason union (effect 4.0.0-rc.111)
  - id: src-node-http-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/platform/node/src/NodeHttpClient.ts
    title: NodeHttpClient source — layerUndici and layerNodeHttp platform layers (effect 4.0.0-rc.111)
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/effect/app-node-platform.ts
    title: opencode@2cba7e2 — one shared HttpClient service provided once in the core layer group
  - id: applied-effect-http-recorder
    resource: https://github.com/anomalyco/effect-http-recorder/blob/89e1b85f7caa12ad076b8f9b65c804f89c60ecd0/src/http/recorder.ts
    title: effect-http-recorder@89e1b85 — record/replay layer substituting the HttpClient service key
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:20:51Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# HTTP client

Call external HTTP services through one configured `HttpClient` service
instead of scattered `fetch` calls.

**Applies when** calling HTTP APIs you do not define — third-party services,
webhooks, other teams' endpoints — and when choosing a client implementation,
setting request policy, retrying transient failures, decoding responses, or
substituting the client in tests.

**Leave alone** clients derived from your own `HttpApi` contract
([HTTP API](http-api.md) owns `HttpApiClient`) and generic Promise or SDK
wrapping without HTTP semantics ([Wrapping](wrapping.md)).

Related: [HTTP API](http-api.md) for APIs you define and their derived
clients, [Wrapping](wrapping.md) for non-HTTP foreign boundaries,
[Error modeling](error-modeling.md) for the domain errors a client boundary
should surface, [Services and layers](services-and-layers.md) for where the
client layer is provided.

`HttpClient` lives under `effect/unstable/http`; expect higher churn than core
modules and re-verify names against the installed version when they disagree
with this guide.

## Choose and provide the client

- Depend on the `HttpClient.HttpClient` service key; choose the
  implementation in a layer at the composition root, not at call
  sites.[^src-http-client]
- `FetchHttpClient.layer` is the portable default wherever `fetch` exists —
  Node 18+, Bun (whose `BunHttpClient` re-exports it), browsers, and edge
  runtimes. Customize via the `Fetch` reference (swap the fetch function) and
  the `RequestInit` service (default credentials, cache, redirect
  options).[^src-fetch-http-client]
- On Node, use `NodeHttpClient.layerUndici` or `NodeHttpClient.layerNodeHttp`
  from `@effect/platform-node` when you need dispatcher or agent control such
  as connection pooling and TLS options.[^src-node-http-client]
- Provide the client once and share it across features rather than building
  one per module.[^applied-opencode]

## Configure one client per upstream service

```ts
import { Context, Effect, flow, Layer, Schedule, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Int,
  title: Schema.String,
}) {}

class TodoApiError extends Schema.TaggedError<TodoApiError>()("TodoApiError", {
  cause: Schema.Defect(),
}) {}

class Todos extends Context.Service<
  Todos,
  { getTodo(id: number): Effect.Effect<Todo, TodoApiError> }
>()("app/Todos") {
  static readonly layer = Layer.effect(
    Todos,
    Effect.gen(function*() {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(flow(
          HttpClientRequest.prependUrl("https://api.example.com"),
          HttpClientRequest.acceptJson,
        )),
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({
          schedule: Schedule.exponential(100),
          times: 3,
        }),
      )
      return Todos.of({
        getTodo: (id) =>
          client.get(`/todos/${id}`).pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)),
            Effect.mapError((cause) => new TodoApiError({ cause })),
            Effect.withSpan("Todos.getTodo", { attributes: { id } }),
          ),
      })
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}
```

- Wrap the upstream service as a small domain service; apply base URL, headers,
  auth, status filtering, and retry once with client transforms instead of
  per-call string assembly.[^docs-http-client-basics]
- `HttpClient.filterStatusOk` turns non-2xx responses into typed
  `StatusCodeError` failures before decoding runs; `retryTransient` works on
  either side of it, since its default `retryOn` covers both errors and raw
  responses.[^src-http-client]
- Client failures are one `HttpClientError` tag carrying a `reason` union
  (`TransportError`, `InvalidUrlError`, `StatusCodeError`, `DecodeError`, and
  friends); recover reason-narrow when you must branch, and translate it into
  your own tagged error at the service boundary so callers see domain
  failures, not transport detail
  ([Error modeling](error-modeling.md)).[^src-http-client-error]

## Construct and transform requests

- Per-call options on `client.get(url, { urlParams, headers })` cover simple
  requests; build richer ones with `HttpClientRequest.post` piped through
  `setUrlParams`, body encoders, and `client.execute`.[^docs-http-client-basics]
- Encode JSON bodies with `bodyJson` (typed `HttpBodyError` failure),
  `bodyJsonUnsafe` (synchronous; encoding may throw), or `schemaBodyJson`
  when the payload has a schema.[^src-http-client-request]
- Set credentials with `basicAuth`/`bearerToken` inside the shared
  `mapRequest` policy so no call site re-implements auth.

## Bound retries to transient failures

- `HttpClient.retryTransient` retries timeouts, `TransportError`, and
  responses with status 408, 429, 500, 502, 503, or 504 by default; widen the
  set only with an explicit `while` predicate.[^src-http-client]
- Always bound it: pass `times`, a terminating `schedule`, or both. An
  unbounded transient retry is an outage amplifier.
- Retry policy composes on the client value, so each upstream service can own
  a different policy while sharing one implementation layer.

## Substitute the client in tests

- Substitute through the same service key: build a stub with
  `HttpClient.make((request) => ...)` returning
  `HttpClientResponse.fromWeb(request, new Response(...))` and provide it with
  `Layer.succeed(HttpClient.HttpClient, stub)`; domain services under test
  stay unchanged.[^src-http-client]
- For realistic fixtures, wrap the upstream client instead of replacing it: a
  `Layer.effect` on the same key can record live responses and replay them
  later, as effect-http-recorder does.[^applied-effect-http-recorder]
- Assert on decoded domain values and typed failures, not on wire strings;
  test the transient-retry path by stubbing a retryable status followed by
  success.

## Review checklist

- Call sites depend on a domain service; only the composition root names a
  client implementation layer.
- Base URL, headers, auth, status filtering, and retry are client transforms
  applied once per upstream service.
- Responses are schema-decoded and `HttpClientError` is translated to a
  domain error at the boundary.
- Every retry is transient-only and explicitly bounded.
- Tests substitute the `HttpClient.HttpClient` key rather than patching
  `fetch` or hitting the network.
- API names have been verified against the installed `unstable/http` version.

[^src-http-client]: `packages/effect/src/unstable/http/HttpClient.ts` at `effect@4.0.0-rc.111` — `HttpClient` service key, `mapRequest`, `filterStatusOk`, `retryTransient` (transient = timeout, `TransportError`, status 408/429/500/502/503/504), `make`.
[^src-fetch-http-client]: `packages/effect/src/unstable/http/FetchHttpClient.ts` at `effect@4.0.0-rc.111`; `@effect/platform-bun` `BunHttpClient.ts` re-exports this module.
[^src-node-http-client]: `packages/platform/node/src/NodeHttpClient.ts` at `effect@4.0.0-rc.111` — `layerUndici`/`layerDispatcher`, `layerNodeHttp`/`layerAgent`.
[^src-http-client-error]: `packages/effect/src/unstable/http/HttpClientError.ts` at `effect@4.0.0-rc.111` — `HttpClientError` with `reason: HttpClientErrorReason` (`TransportError`, `EncodeError`, `InvalidUrlError`, `StatusCodeError`, `DecodeError`, `EmptyBodyError`).
[^docs-http-client-basics]: `ai-docs/src/50_http-client/10_basics.ts` at `effect@4.0.0-rc.111`.
[^src-http-client-request]: `packages/effect/src/unstable/http/HttpClientRequest.ts` at `effect@4.0.0-rc.111` — `bodyJson`, `bodyJsonUnsafe`, `schemaBodyJson`, `basicAuth`, `bearerToken`.
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/effect/app-node-platform.ts` (effect 4.0.0-beta.83).
[^applied-effect-http-recorder]: Observed in effect-http-recorder@89e1b85 `src/http/recorder.ts` (effect 4.0.0-beta.83) — `Layer.effect(HttpClient.HttpClient, ...)` wrapping the upstream client for record/replay.
