---
type: Checklist
title: HTTP client
description: Evaluate whether outbound HTTP has an injectable client, complete policy, typed failure distinctions, schema decoding, and safe retry.
tags: [effect, effect-v4, http-client, schema, retry, timeout, testing]
status: stable
sources:
  - id: effect-http-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/50_http-client/10_basics.ts
    title: Effect 4.0.0-rc.112 HttpClient basics
  - id: effect-http-errors
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/http/HttpClientError.ts
    title: Effect 4.0.0-rc.112 HttpClientError source
  - id: applied-recorder
    resource: https://github.com/anomalyco/effect-http-recorder/blob/89e1b85f7caa12ad076b8f9b65c804f89c60ecd0/src/http/recorder.ts
    title: effect-http-recorder client substitution at 89e1b85
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# HTTP client

- [ ] Obtain `HttpClient` from the environment and expose remote capabilities
  through a domain service when callers should not depend on HTTP details.
- [ ] Apply shared base URL, authentication, accepted media types, tracing, and
  other request policy once to the client used by that integration.
- [ ] Keep transport, URL or request encoding, non-success status, response
  decoding, and domain rejection distinguishable long enough to act correctly.
- [ ] Decode response bodies with schemas at the integration boundary rather
  than casting parsed JSON.
- [ ] Retry only transient failures and repeat-safe requests, with explicit
  bounds, schedule, and status policy.
- [ ] Apply a timeout suitable for the operation and verify interruption reaches
  the underlying client implementation.
- [ ] Redact authorization, cookies, sensitive query values, and payload fields
  from errors, logs, spans, and recorded fixtures.
- [ ] Test with a substituted `HttpClient`, covering request construction,
  status handling, malformed bodies, retry exhaustion, timeout, and cancellation.

## Resources

- [HttpClient basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/50_http-client/10_basics.ts)
- [HttpClientError source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/http/HttpClientError.ts)
- [Applied client substitution in effect-http-recorder](https://github.com/anomalyco/effect-http-recorder/blob/89e1b85f7caa12ad076b8f9b65c804f89c60ecd0/src/http/recorder.ts)
