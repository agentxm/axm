---
type: Checklist
title: HTTP API
description: Evaluate whether one schema-first HTTP contract governs endpoints, validation, errors, middleware, documentation, and clients.
tags: [effect, effect-v4, httpapi, server, schema, middleware, openapi]
status: stable
sources:
  - id: effect-httpapi
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/51_http-server/10_basics.ts
    title: Effect 4.0.0-rc.115 HttpApi basics
  - id: effect-httpapi-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/unstable/httpapi/HttpApi.ts
    title: Effect 4.0.0-rc.115 HttpApi source
  - id: effect-bodyless-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/test/unstable/http/HttpServerResponse.test.ts
    title: Effect 4.0.0-rc.115 bodyless Web response tests
generated: { by: codex/gpt-6, at: 2026-09-11T17:32:03Z }
---

# HTTP API

- [ ] Define one shareable `HttpApi` contract separately from server
  implementations and platform wiring.
- [ ] Give path, query, headers, request bodies, successful responses, and
  expected error responses explicit schemas.
- [ ] Keep domain decisions in handlers or services and transport-wide concerns
  such as authentication and request metadata in middleware.
- [ ] Translate domain failures to declared HTTP errors deliberately; do not
  leak internal defects, schema internals, or platform errors to clients.
- [ ] Make streaming response format, cancellation, and resource lifetime part
  of the endpoint contract when a response is not a finite body.
- [ ] Derive OpenAPI and typed clients from the same API definition so endpoint
  changes remain checked end to end.
- [ ] Isolate platform server layers and version-sensitive
  `effect/unstable/httpapi` wiring at the application edge.
- [ ] Verify responses whose status forbids a body omit it and release unused
  body resources, including statuses 204, 205, and 304.[^effect-bodyless-tests]
- [ ] Test schema rejection, each declared response and error, middleware
  behavior, generated-client compatibility, and handler interruption.

## Resources

- [HttpApi basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/51_http-server/10_basics.ts)
- [HttpApi source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/unstable/httpapi/HttpApi.ts)
- [HttpApi test support](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/51_http-server/20_testing.ts)
- [Bodyless Web response tests](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/test/unstable/http/HttpServerResponse.test.ts)

[^effect-bodyless-tests]: Effect bodyless Web response tests.
