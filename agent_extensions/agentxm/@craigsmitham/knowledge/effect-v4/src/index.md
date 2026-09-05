---
okf_version: "0.2"
---

# Effect v4 checklists

Concise evaluation checklists for designing, implementing, maintaining, and
reviewing Effect v4 TypeScript. Each topic contains eight concrete checks plus
links to the primary sources used to author it.

This bundle was last authored against **Effect 4.0.0-rc.112**. Within Effect
major version 4, use the checklists as the stable design baseline and consult
the linked current sources when an API has changed or remains under an
`effect/unstable/*` import. Effect v3 APIs and conventions are out of scope.

The primary mode is `reporting-review`: use a topic to expose omissions and
make a design or implementation inspectable. During implementation it can also
serve as a `read-do` prompt. For a selected topic, completion means every
applicable item has inspectable code, tests, configuration, or design evidence,
or a documented bounded exception. An unsupported item remains open; checking
a box is only a place marker, not evidence that the work or checklist is good.

The items are non-procedural. They run from foundational choices and boundaries
toward operation and verification, but may be reviewed independently and
resumed at the first open box after interruption.

## Model data

- [Schema boundaries](schema-boundaries.md) — unknown, encoded, and trusted
  domain values.
- [Branded types](branded-types.md) — scalar identity and runtime refinement.
- [Option](option.md) — meaningful absence and nullable boundaries.
- [Collections](collections.md) — representation, identity, ordering, and safe
  operations.
- [Date and time](date-and-time.md) — instants, calendar values, durations,
  zones, and current time.
- [Optics](optics.md) — reusable immutable focus and update operations.

## Model failure

- [Error modeling](error-modeling.md) — expected failure, defects,
  interruption, recovery, and retry.
- [Wrapping foreign APIs](wrapping.md) — synchronous, Promise, callback, and
  SDK boundaries.

## Structure the application

- [Services and layers](services-and-layers.md) — capabilities,
  implementations, dependency graphs, and runtimes.
- [Config](config.md) — typed, validated, secret-safe configuration.

## Own lifetimes and concurrency

- [Resource safety](resource-safety.md) — acquisition, ownership, and cleanup.
- [Structured concurrency](structured-concurrency.md) — child ownership,
  failure policy, bounds, and shutdown.
- [Iteration](iteration.md) — traversal, repetition, polling, and retry.
- [Async coordination](async-coordination.md) — signaling, state, queues,
  admission, and transactions.
- [Streams](streams.md) — zero-to-many production, backpressure, and
  consumption.
- [Request batching and cache](request-batching-and-cache.md) — coalescing,
  value reuse, identity, TTL, and invalidation.
- [Keyed resource sharing](keyed-resource-sharing.md) — reference-counted,
  keyed, and pooled live resources.

## Integrate with platforms

- [Filesystem](filesystem.md) — portable file and path operations.
- [HTTP API](http-api.md) — schema-first server contracts, middleware,
  documentation, and clients.
- [HTTP client](http-client.md) — outbound request policy, decoding, failure,
  and substitution.
- [Cloudflare Workers](cloudflare-workers.md) — bindings, request scopes,
  isolate reuse, and post-response work.
- [SQL](sql.md) — clients, statements, schemas, transactions, and retry.

## Operate and verify

- [Observability](observability.md) — coherent logs, traces, metrics, and
  exporter lifetimes.
- [Testing](testing.md) — deterministic services, time, resources, and
  concurrency.

## Maintaining this bundle

Before changing a checklist, compare it with the current Effect v4 source and
tests and inspect representative current v4 applications or libraries that use
the topic. Keep each checklist between five and ten independently judgeable
items. Put API detail, examples, and further explanation in linked resources
rather than expanding the checklist into a guide. Record baseline changes and
material corrections in the [update log](log.md).

These checklists are **source-reviewed candidates, not field-validated
controls**. The package owner named in `knowledge.json` owns revisions. The
topic boundary, five-to-ten-item form, source traceability, and separation from
long-form guidance are invariant; local teams may adapt evidence capture and
companion links without weakening an item.

Validation should compare representative Effect authors and reviewers using
the checklists with current review practice, measuring missed defects,
reviewer agreement, time, misselection, and unsupported completion. Re-review a
topic when Effect v4 behavior changes, an unstable API moves, applied practice
diverges, or users misinterpret or routinely bypass an item. Split, replace, or
retire a checklist when automation prevents the omission more reliably or the
topic requires substantial branching, explanation, or a procedure.
