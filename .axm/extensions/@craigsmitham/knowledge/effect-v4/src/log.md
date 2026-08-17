# Directory Update Log

## 2026-08-17

* **Creation**: Added [SQL](sql.md) and [Date and time](date-and-time.md). SQL
  earned a concept because `SqlError` carries exactly one tag and discriminates
  one level deeper in `reason`, so the reflex `Effect.catchTag("UniqueViolation")`
  does not compile and the correct move (`Effect.catchReason`) is not guessable
  from the type; transaction ownership and query text in traces have no other
  owner in this bundle. Date and time earned a concept because the instant
  carrier, the boundary transform, and where "now" comes from are three separate
  decisions that get conflated: `DateTime.now` reads the `Clock` reference and is
  therefore testable, while `DateTime.nowUnsafe` is not, and the Schema transform
  family (`DateTimeUtc`, `DateTimeUtcFromDate`, `DateTimeUtcFromString`,
  `DateTimeUtcFromMillis`) must match the driver's storage representation.
* **Convention**: Adopted a three-tier source preference, documented in the root
  [index](index.md). Prefer an immutable permalink carrying a tag or commit;
  then a versioned publisher doc URL where the publisher versions its docs; and
  only where neither exists, a live URL. Tier-3 entries must carry `author` and
  `last_modified`, because a live URL has no other recency signal; tier-1 and
  tier-2 entries do not, because the tag or version already is that signal. The
  Effect v4 API reference is not version-pinned, so it is linked once per guide
  as a browsable route and never used as a per-claim footnote — nothing that
  verifies a claim may silently drift. Source-id prefixes were extended with
  `api-`, `otel-`, `pg-`, and `sqlite-` alongside the existing `src-`, `docs-`,
  `test-`, `schema-`, `applied-`, `origin-`, and `cf-`.
* **Correction**: The post-response telemetry flush ordering in
  [Cloudflare Workers](cloudflare-workers.md) was inverted. Scope close *is* the
  flush: `OtlpExporter.make` registers a scope finalizer that performs the final
  export, and a `Flusher.flush` issued after close is a no-op because the
  finalizer already deregistered the exporter. The guide previously implied
  flush-then-close. Recorded alongside it: `Otlp.layer`, `Otlp.layerJson`, and
  `Otlp.layerProtobuf` are annotated `Layer<never, …>`, and that annotation
  legally erases `OtlpExporter.Flusher` — so a Worker wired through `Otlp.layer`
  cannot `yield* OtlpExporter.Flusher` at all, and must wire `OtlpTracer.layer`,
  `OtlpLogger.layer`, and `OtlpMetrics.layer` individually if it intends to
  flush explicitly.
* **Boundary**: Declined six candidate entries as application-specific rather
  than portable Effect knowledge. RFC 9457 problem-details — an HTTP
  representation choice, not an Effect failure-modeling decision. Log-level
  selection — an operational policy that varies per deployment. Optimistic-
  concurrency version columns — a data-model pattern independent of the SQL
  client. "Do not test config plumbing" — a testing-taste claim with no
  version-specific Effect content. Server/client layer-module placement — a
  repository layout convention, not a Layer semantics rule. "Raw millisecond
  arithmetic is prohibited" — overstated as a prohibition: `Duration.Input`
  admits a bare millis number by design, so the honest guidance is to choose the
  carrier deliberately, which [Date and time](date-and-time.md) now does.
* **Provenance**: [SQL](sql.md) deliberately follows the spine observed in the
  applied corpus — client wiring, statement construction, `SqlError` reason
  handling, `SqlSchema` at the boundary, transaction ownership — rather than
  upstream's documented `Model.Class` -> `Migrator` -> `SqlModel` spine. The
  applied references reach for `SqlSchema` and raw statements far more than for
  `Model.Class`, dialect clients differ materially in what they support (D1 ships
  no migrator; sqlite-do rejects nested transactions), and the upstream spine
  front-loads a modeling commitment most readers arrive after having already
  made. Upstream's spine is reachable from the guide; it is not the entry route.
* **Retarget**: Re-pinned the corpus target to `Effect 4.0.0-rc.110` in the
  root index (previously `4.0.0-beta.107`) after verifying from npm dist-tags
  and the `effect@4.0.0-rc.110` tag that the rc line directly continues the
  beta line. Every materially version-specific claim was re-verified against
  the rc.110 sources rather than mechanically renamed.
* **Provenance**: Replaced each guide's sole retired-skill source with
  official Effect sources (ai-docs documents, module source, and tests,
  tag-pinned to `effect@4.0.0-rc.110`) plus revision-pinned applied
  references where a pattern was actually observed; retired-skill sources
  remain as lineage only. Added machine `verified` events recording when each
  guide was checked.
* **Correction**: Removed Effect v3 carryovers and stale beta-era notes:
  `Effect.iterate`/`Effect.loop` (gone in v4) replaced with `Effect.whileLoop`,
  `Effect.gen` loops, `Stream.iterate`, and `Effect.repeat` in
  [Iteration](iteration.md); `Record.partitionMap` and Option-based
  `Array.filterMap` corrected in [Collections](collections.md); the `it.scoped`
  trap documented in [Testing](testing.md); the wrong `beta.107` rename note
  removed from [Error modeling](error-modeling.md).
* **Boundary**: Re-scoped [HTTP API](http-api.md) as platform-neutral (its
  claims verify on any platform) and made
  [Cloudflare Workers](cloudflare-workers.md) the sole owner of Workers
  runtime semantics; Cloudflare-platform assertions now cite Cloudflare
  documentation explicitly. Duplicated rules across neighboring guides were
  consolidated to single owners with cross-references.
* **Creation**: Added [HTTP client](http-client.md) (outbound HTTP with typed
  failure, retry, and substitution) and
  [Keyed resource sharing](keyed-resource-sharing.md) (RcMap, LayerMap, Pool)
  after an evidence review of current official rc.110 API support and applied
  references; six other candidate guides were declined as folds into existing
  guides.

## 2026-08-12

* **Creation**: Established the Effect v4 knowledge bundle with twenty guides
  grouped by data modeling, failure, application structure, lifetimes and
  concurrency, platform integration, and verification.
* **Conversion**: Migrated the bodies of twenty retired predecessor skill
  packages into this bundle. Each guide's `sources` entry records the exact
  retired package it came from as a permalink, for attribution only; nothing in
  this bundle reads or requires those packages, and they are no longer
  published. Each guide opens with the routing conditions that were previously
  carried by the predecessor's skill description.
* **Convention**: Adopted `type: Guide` for normative decision guidance
  consulted while making a judgment, reserving `Playbook` for step-wise
  procedures that produce ordered actions. This bundle currently contains no
  `Playbook` concepts.
* **Convention**: Pinned the target version (`Effect 4.0.0-beta.107`) once in
  the root index instead of repeating it in every concept. Version-specific API
  claims were marked inline in the guides that made them, at the time
  [Error modeling](error-modeling.md) and [HTTP API](http-api.md).
