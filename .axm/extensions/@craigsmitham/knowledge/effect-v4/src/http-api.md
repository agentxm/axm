---
type: Guide
title: HTTP API
description: Declarative HttpApi services on Cloudflare Workers; use for endpoints, schemas, middleware, typed HTTP failures, OpenAPI, and derived clients.
tags: [effect, effect-v4, httpapi, http, openapi, middleware, cloudflare-workers, fetch, api-client]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-http-api/src/SKILL.md
    title: effect-v4-http-api skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# HTTP API

Keep one declarative API contract as the source for routing, validation,
handlers, OpenAPI, and typed clients.

**Applies when** defining endpoints, schemas, handlers, middleware, security,
typed HTTP failures, OpenAPI, derived clients, Fetch handlers, or HttpApi tests.

**Leave alone** React Router actions, generic Fetch routing, and non-Cloudflare
hosting policy.

Related: [Cloudflare Workers](cloudflare-workers.md) for the runtime and binding
model, [Schema boundaries](schema-boundaries.md) for the endpoint schemas,
[Error modeling](error-modeling.md) for what may become a public response.

This guide makes several `4.0.0-beta.107`-specific API claims; they are marked
inline. Verify them against the installed version before relying on them.

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

- Put path params, query, headers, payload, success, and expected errors in the
  endpoint constructor options. In beta.107, API/group/endpoint values do not
  expose `addError` or `addSuccess`.
- Ordinary success schemas default to 200. Use `HttpApiSchema.NoContent` for
  204 or another named/explicit empty schema for a different empty status.
- Use arrays of response schemas when an endpoint has multiple legitimate
  status/content-type alternatives; keep their selection unambiguous.
- Model typed response headers with `HttpApiSchema.WithHeaders` and
  `encodeToWithHeaders`; do not fall back to raw handlers merely because a
  response owns headers.
- Define expected schema-backed failures with `Schema.TaggedError`; reserve
  defects for unmodeled failures that must not become public responses.

## Implement handlers and middleware

- Build handlers with `HttpApiBuilder.group(Api, groupName, ...)`. Handler
  inputs are already decoded; call domain services and return the declared
  success or error values.
- Use raw handlers only when the response contract cannot be expressed by the
  typed endpoint surface, such as a genuinely custom streaming protocol.
- Put authentication, CORS, request context, and other transport-wide behavior
  in typed middleware. Declare each middleware's security and failure schema.
- Beta.107 schema decode failures are `HttpApiError.HttpApiSchemaError`. A
  schema-error transform must return an `HttpServerResponse` or fail with its
  declared error; succeeding with an error value is not a valid transform.
- `HttpApiSecurity.basic` supplies `{ username, password }`; only the password
  is redacted. Bearer, API-key, and custom HTTP schemes expose their own
  credential shapes — inspect the constructor rather than assuming one shape.

## Compose for Fetch and Cloudflare

- Assemble the API and handler layers once, then convert the router with
  `HttpRouter.toWebHandler` for a Fetch-compatible entry point.
- Inject request-time bindings or request context through the handler context;
  keep heavy construction out of module global scope.
- A warm isolate is an optimization, never a correctness requirement. Ensure
  request-scoped resources and finalizers complete within the invocation model.
- Use `ctx.waitUntil` only for bounded post-response work. It is not durable job
  storage and must not be the sole owner of required business state.

## OpenAPI and clients

- Annotate the API, endpoints, and schemas with stable operation names and
  descriptions. Use `OpenApi.fromApi` for build-time extraction.
- `HttpApiBuilder.layer(Api, { openapiPath })` owns a raw JSON OpenAPI route.
  Swagger and Scalar layers mount interactive pages, not the raw spec itself.
- Derive clients with `HttpApiClient.make`; provide the base URL and auth as
  client construction/transform policy rather than per-call string assembly.
- Keep decoded-only mode for ordinary calls and select response-inclusive modes
  only when callers need status or headers.

## Verify the boundary

- Unit-test exported handler effects with test service layers and typed errors.
- Use `NodeHttpServer.layerTest` or the matching platform test server for full
  transport tests; share a server with `it.layer` when the suite owns it.
- Assert ordinary calls with the typed client. Use a raw client only for wire
  details the typed contract intentionally abstracts.
- Test schema failures, middleware rejection, response headers, empty statuses,
  OpenAPI output, Cloudflare context injection, and defect non-disclosure.

## Review checklist

- One contract drives server, OpenAPI, and client behavior.
- All endpoint input/output/error alternatives are schema-declared.
- Beta.107 names and status semantics are used; no stale decode-error,
  `addError`, `addSuccess`, or `Schema.Void`-means-204 assumptions remain.
- Transport middleware and domain services retain separate responsibilities.
- The Fetch/Cloudflare composition has explicit binding, lifetime, and
  post-response-work semantics.
