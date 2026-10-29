---
type: Checklist
title: Cloudflare Workers
description: Evaluate whether Effect services, scopes, background work, bindings, and state align with the Workers request and isolate model.
tags: [effect, effect-v4, cloudflare, workers, waituntil, bindings, serverless]
status: stable
sources:
  - id: cloudflare-context
    resource: https://developers.cloudflare.com/workers/runtime-apis/context/
    title: Cloudflare Workers execution context
  - id: cloudflare-bindings
    resource: https://developers.cloudflare.com/workers/runtime-apis/bindings/
    title: Cloudflare Workers bindings
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/59fd1170ee559b47c59aab437ba701a7b05b8497/examples/cloudflare-worker-async/src/worker.ts
    title: Alchemy native async Worker platform boundary at 59fd117 (Effect catalog 4.0.5)
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Cloudflare Workers

- [ ] Adapt bindings into typed services or configuration at the Worker
  boundary rather than threading the raw environment through domain logic.
- [ ] Keep correctness independent of isolate reuse: global caches may improve
  performance but must not be the sole durable source of truth.
- [ ] Give request-specific values and resources a request scope; share only
  services that are safe across requests handled by the same isolate.
- [ ] Attach bounded, best-effort post-response work to
  `ExecutionContext.waitUntil` and observe failures. HTTP-triggered Workers share
  a 30-second allowance across these calls after the response or client
  disconnect; unfinished work is canceled.[^cloudflare-context]
- [ ] Queue or persist longer or delivery-critical work before responding;
  `waitUntil` is not a durable handoff.[^cloudflare-context]
- [ ] Ensure interruption and scope closure do not terminate post-response work
  before it is transferred to the platform owner.
- [ ] Treat Durable Objects, D1, R2, KV, Queues, Hyperdrive, and service bindings
  as infrastructure boundaries with their own consistency and failure semantics.
- [ ] Keep web-handler creation, disposal, and any telemetry flush behavior
  aligned with the lifetime of the runtime actually used.
- [ ] Test with the Workers runtime tooling, covering cold and reused isolates,
  concurrent requests, binding failures, `waitUntil` time-limit cancellation,
  durable handoff, and cleanup.

## Resources

- [Execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)
- [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- [Effect HttpApi web handler](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/51_http-server/10_basics.ts)
- [Durable Object SQLite transactions](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/sql/sqlite-do/src/SqliteClient.ts)
- [Native async Worker boundary in Alchemy (not Effect service style)](https://github.com/alchemy-run/alchemy/blob/59fd1170ee559b47c59aab437ba701a7b05b8497/examples/cloudflare-worker-async/src/worker.ts)

[^cloudflare-context]: Cloudflare Workers execution context and post-response limits.
