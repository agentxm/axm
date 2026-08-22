---
name: craft-effect-v4
description: >
  Routes Effect v4 TypeScript work to opinionated guides on data modeling,
  services and layers, errors, schemas, configuration, resource safety,
  concurrency, streams, platform integration, testing, and observability. Use
  when designing TypeScript architecture or writing or reviewing TypeScript in
  an Effect codebase, and when designs or code involve service boundaries, raw
  `process.env` reads, thrown or `unknown` errors, unvalidated JSON casts,
  `Promise.all`, detached promises, `try/finally` cleanup, homemade caches,
  per-key client or connection maps, scattered `fetch` calls, `console.log`
  telemetry, or direct `node:fs` use — even where Effect is absent but
  warranted. Not for Effect v3 conventions or codebases that deliberately use
  another runtime model.
compatibility: Effect 4.0.0-rc.110
---

# Craft Effect v4

Route Effect v4 work to the smallest relevant part of
`@craigsmitham/knowledge/effect-v4`.

1. Confirm the codebase targets Effect v4. v3 conventions do not carry
   forward, and these guides do not describe them.
2. Read
   `.axm/extensions/@craigsmitham/knowledge/effect-v4/src/index.md` and open
   only the guides the work needs.

| Symptom or request                                                                                                             | Start with                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Service ownership, dependency boundaries, layer composition, or dependencies hard to fake in tests                             | `services-and-layers.md`                                       |
| Choosing how to run the composed graph: `runMain`, `Layer.launch`, or `ManagedRuntime`                                         | `services-and-layers.md`                                       |
| Primitives conflated, unvalidated input, nullish boundaries                                                                    | `schema-boundaries.md`, then `branded-types.md` or `option.md` |
| External JSON cast into a domain type, duplicated ad-hoc validation, or an unclear Struct-vs-Class domain carrier              | `schema-boundaries.md`                                         |
| Same-representation IDs or units getting swapped, or a scalar invariant re-checked at every call site                          | `branded-types.md`                                             |
| Repeated null checks, lookups that miss without failing, or nullable wire fields leaking into the domain                       | `option.md`                                                    |
| Unsafe indexing, value-based keys, multi-pass array code                                                                       | `collections.md`                                               |
| Timestamps in the domain or on the wire, instants versus spans, clock reads, time-dependent tests                              | `date-and-time.md`                                             |
| Nested path updates repeated across modules, or focusing optional data and union variants immutably                            | `optics.md`                                                    |
| `process.env` reads, repeated parsing or defaults, leaked secrets, startup before validation                                   | `config.md`                                                    |
| Throws, `catch (unknown)`, stringified failures, broad recovery, blind retries                                                 | `error-modeling.md`                                            |
| Raw promises, callback registration, or a vendor SDK leaking into Effect code                                                  | `wrapping.md`                                                  |
| `try/finally`, open/close pairs, leaked handles, unclear cleanup on interruption                                               | `resource-safety.md`                                           |
| `Promise.all`, detached promises, `AbortController`, manual races, orphaned background fibers                                  | `structured-concurrency.md`, then `iteration.md`               |
| Async loops, polling with sleep flags, manual retry/backoff, or choosing a traversal's concurrency bound                       | `iteration.md`                                                 |
| Homegrown locks, shared mutable state, event emitters, polling flags, admission control                                        | `async-coordination.md`                                        |
| Unbounded, paginated, or event-driven input; multi-value workflows                                                             | `streams.md`                                                   |
| N+1 access, duplicate in-flight lookups, homemade `Map` caches of values                                                       | `request-batching-and-cache.md`                                |
| A per-key client, connection, or runtime rebuilt per use, leaked in a `Map`, or torn down while another consumer still uses it | `keyed-resource-sharing.md`                                    |
| `console.log`, manual timing, no request correlation, exporter wiring                                                          | `observability.md`                                             |
| Real-time sleeps, mocked internals, leaked fibers, flaky tests                                                                 | `testing.md`                                                   |
| `node:fs` or `node:path` in production code                                                                                    | `filesystem.md`                                                |
| Declarative HTTP endpoints, OpenAPI, middleware, clients derived from your own contract                                        | `http-api.md`                                                  |
| Outbound calls to a third-party HTTP API, scattered `fetch`, per-call URL and auth assembly                                    | `http-client.md`                                               |
| Worker bindings, `waitUntil`, isolate reuse, Hyperdrive                                                                        | `cloudflare-workers.md`                                        |
| Relational access, transaction ownership, dialect client wiring, constraint-violation errors                                   | `sql.md`                                                       |

3. Follow the selected guides and repository-local requirements. Open the
   guides they cross-link only when the requested scope needs them.

During a design or architecture workflow, use the guides to establish
version-matched capability semantics, constraints, and feasibility evidence for
the options under consideration. Supply that evidence to the active workflow;
do not choose consequential alternatives for the developer. Do not infer that
Effect availability alone makes its use a binding architectural rule.

When feasibility depends on a guide's API claim, or that claim conflicts with
the installed Effect version, inspect current public Effect v4 source and tests
before acting, and report the drift.
