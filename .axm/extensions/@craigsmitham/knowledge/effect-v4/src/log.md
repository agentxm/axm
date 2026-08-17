# Directory Update Log

## 2026-08-17

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
