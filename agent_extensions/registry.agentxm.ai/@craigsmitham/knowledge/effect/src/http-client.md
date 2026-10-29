---
type: Checklist
title: HTTP client
description: Evaluate whether outbound HTTP has an injectable client, complete policy, typed failure distinctions, schema decoding, and safe retry.
tags: [effect, effect-v4, http-client, schema, retry, timeout, testing]
status: stable
sources:
  - id: effect-http-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/50_http-client/10_basics.ts
    title: Effect 4.1.0 HttpClient basics
  - id: effect-http-errors
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/http/HttpClientError.ts
    title: Effect 4.1.0 HttpClientError source
  - id: applied-recorder
    resource: https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/http-recorder/src/http/recorder.ts
    title: opencode HTTP recorder service decoration, Effect 4.0.1, at 432d870
  - id: effect-http-client-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/http/HttpClient.ts
    title: Effect 4.1.0 HTTP retry and redirect contracts
  - id: effect-url-params
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/http/UrlParams.ts
    title: Effect 4.1.0 query redaction contract
  - id: effect-fetch-streams
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/http/FetchHttpClient.test.ts
    title: Effect 4.1.0 streaming upload fallback tests
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# HTTP client

- [ ] Obtain `HttpClient` from the environment and expose remote capabilities
  through a domain service when callers should not depend on HTTP details.
- [ ] Apply shared base URL, authentication, accepted media types, tracing, and
  other request policy once to the client used by that integration. For
  `withCookiesRef`, use `Ref<ReadonlyArray<Cookies.Cookie>>` and seed cookies
  with origin/domain information so host, path, and scheme restrict their
  transmission.[^effect-http-client-source]
- [ ] Keep transport, URL or request encoding, non-success status, response
  decoding, and domain rejection distinguishable long enough to act correctly.
- [ ] Decode response bodies with schemas at the integration boundary rather
  than casting parsed JSON.
- [ ] Retry only transient failures and repeat-safe requests, with explicit
  bounds, schedule, and status policy; account for server `Retry-After` delays
  when using `HttpClient.retryTransient`.[^effect-http-client-source]
- [ ] Choose redirect ownership deliberately; `HttpClient.followRedirects`
  with `FetchHttpClient` requires `FetchHttpClient.RequestInit` with
  `redirect: "manual"`.[^effect-http-client-source]
- [ ] Verify streaming uploads on the deployed runtime. Unsupported
  `FetchHttpClient` streaming fails with `EncodeError`; opt into
  `FetchHttpClient.StreamBodyFallback` set to `"buffer"` only with a bounded
  body and an acceptable memory budget.[^effect-fetch-streams]
- [ ] Apply a timeout suitable for the operation and verify interruption reaches
  the underlying client implementation.
- [ ] Redact authorization, cookies, sensitive query values, and payload fields
  from errors, logs, spans, and recorded fixtures; a custom
  `UrlParams.CurrentRedactedNames` list replaces the defaults. Safe error
  serialization does not redact the raw `request` and `response` properties
  when accessed directly.[^effect-url-params][^effect-http-errors]
- [ ] Test with a substituted `HttpClient`, covering request construction,
  status handling, malformed bodies, retry exhaustion, timeout, and
  cancellation.[^applied-recorder]

## Resources

- [HttpClient basics](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/50_http-client/10_basics.ts)
- [HttpClientError source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/http/HttpClientError.ts)
- [Applied client decoration in opencode HTTP recorder (Effect 4.0.1)](https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/http-recorder/src/http/recorder.ts)

[^effect-http-client-source]: [Effect HTTP retry and redirect contracts](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/http/HttpClient.ts).

[^effect-url-params]: [Effect query redaction contract](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/http/UrlParams.ts).

[^applied-recorder]: opencode HTTP recorder decoration of the injectable HttpClient service.

[^effect-fetch-streams]: [Effect streaming upload fallback tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/http/FetchHttpClient.test.ts).

[^effect-http-errors]: Effect HTTP error serialization and raw request/response access.
