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
    resource: https://github.com/alchemy-run/alchemy/blob/ba579a98ea24b41cbf77a89ec8602fe071d5e43a/examples/cloudflare-worker-async/src/worker.ts
    title: Alchemy Cloudflare Worker at ba579a9
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Cloudflare Workers

- [ ] Adapt bindings into typed services or configuration at the Worker
  boundary rather than threading the raw environment through domain logic.
- [ ] Keep correctness independent of isolate reuse: global caches may improve
  performance but must not be the sole durable source of truth.
- [ ] Give request-specific values and resources a request scope; share only
  services that are safe across requests handled by the same isolate.
- [ ] Attach work that must continue after the response to
  `ExecutionContext.waitUntil`, and make its failure observation explicit.
- [ ] Ensure interruption and scope closure do not terminate post-response work
  before it is transferred to the platform owner.
- [ ] Treat Durable Objects, D1, R2, KV, Queues, Hyperdrive, and service bindings
  as infrastructure boundaries with their own consistency and failure semantics.
- [ ] Keep web-handler creation, disposal, and any telemetry flush behavior
  aligned with the lifetime of the runtime actually used.
- [ ] Test with the Workers runtime tooling, covering cold and reused isolates,
  concurrent requests, binding failures, `waitUntil`, and cleanup.

## Resources

- [Execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)
- [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- [Effect HttpApi web handler](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/51_http-server/10_basics.ts)
- [Applied Cloudflare Worker in Alchemy](https://github.com/alchemy-run/alchemy/blob/ba579a98ea24b41cbf77a89ec8602fe071d5e43a/examples/cloudflare-worker-async/src/worker.ts)
