---
type: Checklist
title: HTTP API
description: Evaluate whether one schema-first HTTP contract governs endpoints, validation, errors, middleware, documentation, and clients.
tags: [effect, effect-v4, httpapi, server, schema, middleware, openapi]
status: stable
sources:
  - id: effect-httpapi
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/51_http-server/10_basics.ts
    title: Effect 4.0.0 HttpApi basics
  - id: effect-httpapi-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/http-api/HttpApi.ts
    title: Effect 4.0.0 HttpApi source
  - id: effect-httpapi-parse-options
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/http-api/HttpApi.ts#L350-L410
    title: Effect 4.0.0 HttpApi parse options
  - id: effect-bodyless-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/test/http/HttpServerResponse.test.ts
    title: Effect 4.0.0 bodyless Web response tests
  - id: effect-httprouter-serve
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/http/HttpRouter.ts#L1273-L1289
    title: Effect 4.0.0 HttpRouter.serve layer isolation
generated: { by: claude/opus-5.5, at: 2026-10-01T19:24:06Z }
---

# HTTP API

- [ ] Define one shareable `HttpApi` contract separately from server
  implementations and platform wiring.
- [ ] Give path, query, headers, request bodies, successful responses, and
  expected error responses explicit schemas.
- [ ] Set codec parse options such as excess-property policy once with
  `HttpApi.ParseOptions` or a per-slot annotation at the API, group, or
  endpoint; a slot annotation outranks `ParseOptions` at any level, a nearer
  level replaces rather than merges, and strict policy rejects transport
  headers unless `HeadersParseOptions` relaxes it.[^effect-httpapi-parse-options]
- [ ] Keep domain decisions in handlers or services and transport-wide concerns
  such as authentication and request metadata in middleware.
- [ ] Translate domain failures to declared HTTP errors deliberately; do not
  leak internal defects, schema internals, or platform errors to clients.
- [ ] Make streaming response format, cancellation, and resource lifetime part
  of the endpoint contract when a response is not a finite body.
- [ ] Derive OpenAPI and typed clients from the same API definition so endpoint
  changes remain checked end to end.
- [ ] Isolate platform server layers and `effect/http-api` wiring, which is
  tagged `@stability unstable`, at the application edge; provide services that
  sibling layers share outside `HttpRouter.serve`, which builds its app
  privately.[^effect-httprouter-serve]
- [ ] Verify responses whose status forbids a body omit it and release unused
  body resources, including statuses 204, 205, and 304.[^effect-bodyless-tests]
- [ ] Test schema rejection, each declared response and error, middleware
  behavior, generated-client compatibility, and handler interruption.

## Resources

- [HttpApi basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/51_http-server/10_basics.ts)
- [HttpApi source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/http-api/HttpApi.ts)
- [HttpApi test support](https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/51_http-server/20_testing.ts)
- [HttpApi parse options](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/http-api/HttpApi.ts#L350-L410)
- [Bodyless Web response tests](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/test/http/HttpServerResponse.test.ts)
- [HttpRouter.serve layer isolation](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/http/HttpRouter.ts#L1273-L1289)

[^effect-httpapi-parse-options]: Effect HttpApi parse options.
[^effect-bodyless-tests]: Effect bodyless Web response tests.
[^effect-httprouter-serve]: Effect HttpRouter.serve layer isolation.
