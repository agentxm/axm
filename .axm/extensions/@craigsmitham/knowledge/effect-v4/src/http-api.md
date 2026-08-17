---
type: Guide
title: HTTP API
description: One declarative HttpApi contract driving routing, validation, OpenAPI, and typed clients; use for endpoints, schemas, middleware, security, typed HTTP failures, and derived clients on any platform.
tags: [effect, effect-v4, httpapi, http, openapi, middleware, security, fetch, api-client, testing]
status: stable
sources:
  - id: docs-http-server
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/51_http-server/10_basics.ts
    title: Official Effect docs — HttpApi server wiring and toWebHandler (effect 4.0.0-rc.110)
  - id: docs-http-endpoints
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/51_http-server/fixtures/api/Users.ts
    title: Official Effect docs — endpoint options, response alternatives, status annotations (effect 4.0.0-rc.110)
  - id: docs-http-testing
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/51_http-server/20_testing.ts
    title: Official Effect docs — HttpApiTest in-memory typed-client testing (effect 4.0.0-rc.110)
  - id: src-httpapi-endpoint
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts
    title: HttpApiEndpoint source — constructor options, delete alias, client response modes (effect 4.0.0-rc.110)
  - id: src-httpapi-middleware
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/httpapi/HttpApiMiddleware.ts
    title: HttpApiMiddleware source — middleware config, layerSchemaErrorTransform (effect 4.0.0-rc.110)
  - id: src-httpapi-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/httpapi/HttpApiSchema.ts
    title: HttpApiSchema source — NoContent, status defaults, WithHeaders, StreamSse (effect 4.0.0-rc.110)
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/server/src/routes.ts
    title: opencode@2cba7e2 — production HttpApi server, schema-error transform, OpenAPI route
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-http-api/src/SKILL.md
    title: effect-v4-http-api skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:10:36Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
---

# HTTP API

Keep one declarative API contract as the source for routing, validation,
handlers, OpenAPI, and typed clients.

**Applies when** defining endpoints, schemas, handlers, middleware, security,
typed HTTP failures, OpenAPI, derived clients, or HttpApi tests, and when
converting the assembled router to a Fetch handler — on any platform.

**Leave alone** framework-specific routing such as React Router actions,
hosting policy, and platform runtime semantics — for Workers those are owned
by [Cloudflare Workers](cloudflare-workers.md).

Related: [Schema boundaries](schema-boundaries.md) for the endpoint schemas,
[Error modeling](error-modeling.md) for what may become a public response,
[HTTP client](http-client.md) for calling APIs you do not define,
[Cloudflare Workers](cloudflare-workers.md) for the Workers runtime and
binding model.

`HttpApi` lives under `effect/unstable/httpapi`; expect higher churn than
core modules and re-verify names against the installed version when they
disagree with this guide.

## Define the contract

```ts
import { Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi"

class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

const getUser = HttpApiEndpoint.get("getUser", "/:id", {
  params: { id: Schema.String },
  success: User,
  error: NotFound,
})

const deleteUser = HttpApiEndpoint.delete("deleteUser", "/:id", {
  params: { id: Schema.String },
  success: HttpApiSchema.NoContent,
})

const Users = HttpApiGroup.make("Users").add(getUser, deleteUser).prefix("/users")
const Api = HttpApi.make("Api").add(Users).prefix("/v1")
```

- Put path params, query, headers, payload, success, and expected errors in
  the endpoint constructor options. API, group, and endpoint values expose no
  `addError` or `addSuccess`; the constructor options are the whole input
  surface.[^src-httpapi-endpoint]
- Ordinary success schemas default to 200. Use `HttpApiSchema.NoContent` for
  204 or another named/explicit empty schema for a different empty
  status.[^src-httpapi-schema]
- Use arrays of response schemas when an endpoint has multiple legitimate
  status/content-type alternatives; keep their selection
  unambiguous.[^docs-http-endpoints]
- Model typed response headers with `HttpApiSchema.WithHeaders(schema,
  headerFields)` for declared responses, or pipe a schema through
  `encodeToWithHeaders({ body, headers }, { decode, encode })` when the wire
  shape differs; do not fall back to raw handlers merely because a response
  owns headers.[^src-httpapi-schema]
- Define expected schema-backed failures with `Schema.TaggedError` and status
  annotations; reserve defects for unmodeled failures that must not become
  public responses.

## Implement handlers and middleware

- Build handlers with `HttpApiBuilder.group(Api, groupName, ...)`. Handler
  inputs are already decoded; call domain services and return the declared
  success or error values.
- Type streaming responses with `HttpApiSchema.StreamSse` or
  `HttpApiSchema.StreamUint8Array`. Use raw handlers only when the response
  contract cannot be expressed by the typed surface at all.[^src-httpapi-schema]
- Put authentication, CORS, request context, and other transport-wide behavior
  in typed middleware. Declare each middleware's security and failure schema.
- Schema decode failures are `HttpApiError.HttpApiSchemaError`. Reshape them
  with `HttpApiMiddleware.layerSchemaErrorTransform`: the transform must
  return an `HttpServerResponse` or fail with its declared error; succeeding
  with an error value is not a valid transform.[^src-httpapi-middleware]
- `HttpApiSecurity.basic` supplies `{ username, password }`; only the password
  is redacted. Bearer, API-key, and custom HTTP schemes expose their own
  credential shapes — inspect the constructor rather than assuming one shape.

## Convert to a Fetch handler

- Assemble the API and handler layers once, then convert with
  `HttpRouter.toWebHandler`, providing `HttpServer.layerServices`, for a
  Fetch-compatible entry point on any Fetch-based host.[^docs-http-server]
- Everything platform-specific about that host — bindings, runtime lifetime,
  post-response work — belongs to the platform guide; for Workers see
  [Cloudflare Workers](cloudflare-workers.md).

## OpenAPI and clients

- Annotate the API, endpoints, and schemas with stable operation names and
  descriptions. Use `OpenApi.fromApi` for build-time extraction.
- `HttpApiBuilder.layer(Api, { openapiPath })` owns a raw JSON OpenAPI route.
  Swagger and Scalar layers mount interactive pages, not the raw spec itself.
- Derive clients with `HttpApiClient.make`; provide the base URL and auth as
  client construction/transform policy rather than per-call string assembly.
- Keep decoded-only mode for ordinary calls and select response-inclusive
  modes only when callers need status or headers.

## Verify the boundary

- Test groups in memory with `HttpApiTest.groups`: a typed client against the
  handler layers, no server required.[^docs-http-testing]
- Use `NodeHttpServer.layerTest` or the matching platform test server for full
  transport tests; share a server with `it.layer` when the suite owns it.
- Assert ordinary calls with the typed client. Use a raw client only for wire
  details the typed contract intentionally abstracts.
- Test schema failures, middleware rejection, response headers, empty
  statuses, OpenAPI output, and defect non-disclosure.

## Review checklist

- One contract drives server, OpenAPI, and client behavior.
- All endpoint input/output/error alternatives are schema-declared, including
  streaming and header-bearing responses.
- Transport middleware and domain services retain separate responsibilities.
- The Fetch conversion is one boundary; platform runtime semantics live in the
  platform guide.
- API names have been verified against the installed `unstable/httpapi`
  version.

[^src-httpapi-endpoint]: `packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts` at `effect@4.0.0-rc.110`; no `addError`/`addSuccess` exists anywhere under `unstable/httpapi`.
[^src-httpapi-schema]: `packages/effect/src/unstable/httpapi/HttpApiSchema.ts` at `effect@4.0.0-rc.110` — `NoContent` (204), success default 200, `WithHeaders`/`encodeToWithHeaders`, `StreamSse`, `StreamUint8Array`.
[^src-httpapi-middleware]: `packages/effect/src/unstable/httpapi/HttpApiMiddleware.ts` at `effect@4.0.0-rc.110`; applied in opencode@2cba7e2 `packages/server/src/middleware/schema-error.ts`.
[^docs-http-endpoints]: `ai-docs/src/51_http-server/fixtures/api/Users.ts` at `effect@4.0.0-rc.110`.
[^docs-http-server]: `ai-docs/src/51_http-server/10_basics.ts` at `effect@4.0.0-rc.110`; `HttpRouter.toWebHandler` at `packages/effect/src/unstable/http/HttpRouter.ts`.
[^docs-http-testing]: `ai-docs/src/51_http-server/20_testing.ts` and `packages/effect/src/unstable/httpapi/HttpApiTest.ts` at `effect@4.0.0-rc.110`.
