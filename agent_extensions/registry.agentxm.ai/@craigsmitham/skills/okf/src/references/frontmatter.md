# OKF frontmatter reference

`type` is the only always-required key. A concept carrying just `type` is fully conformant.

| Field | Req | Form | Notes |
|---|---|---|---|
| `type` | **yes** | string | Kind of concept. Uncontrolled vocabulary — see [Type discipline](../SKILL.md#type-discipline). |
| `title` | rec | string | Canonical display name. Use exact wording in index links. Consumers may fall back to the filename. |
| `description` | rec | string | One sentence distinguishing this concept from its neighbors. For action concepts, include the selection condition and supported outcome; for Processes, include the trigger and closing outcome. Reuse it exactly in index entries and search snippets. |
| `resource` | rec | URI/path | Canonical URI of the underlying asset. Omit for abstract concepts. |
| `tags` | rec | list | Stable domain terms, aliases, and query vocabulary; do not merely repeat the title. |
| `sources` | opt | list | Provenance. Each entry needs `resource`; `id`, `title`, `author`, `usage_count`, `last_modified`, `usage_window` optional. `last_modified` is an offset datetime. |
| `usage_window` | opt | `{from, to}` | Sibling of `sources`; frames every `usage_count`. Offset datetimes; an entry's own window overrides the shared one. |
| `generated` | opt | `{by, at}` | `by` required within it; an actor. `at` = last meaningful content change, offset datetime. |
| `verified` | opt | list of `{by, at}` | Verification events. A bare mapping is a one-element list. |
| `status` | opt | enum | `draft` \| `stable` \| `deprecated`. Absent means `stable`. |
| `stale_after` | opt | offset datetime | Absolute instant, not a TTL. Stale when `now >= stale_after`. |

## Add metadata from evidence

The concept template intentionally omits trust, usage, freshness, and source
claims. Add them when the corresponding evidence exists; omission is valid.

- Record `generated` for the actual producer and meaningful content change.
- Add `sources` for material actually used. Give each cited source an `id`, and
  use that ID in claim footnotes. Omit unknown authors and modification times.
- Add `verified` only after content was checked against its sources or resource.
  Passing a format validator alone does not verify the knowledge in the body.
- Record `usage_count: 0` only when a measurement actually found zero uses in a
  known window. Unknown usage is not zero; omit the count and window.
- Set `stale_after` from a supported freshness decision or explicit producer
  policy. Do not invent a universal expiry interval or reset it after formatting.

For example, after establishing a real source and verification event, fill the
following placeholders from that evidence. These blocks are optional examples,
not defaults to copy into every concept:

```yaml
sources:
  - id: policy
    resource: "{{actual source URI or scope}}"
    title: "{{source title}}"
verified:
  - by: "{{actual verifier actor}}"
    at: "{{recorded verification datetime with offset}}"
```

The body can then use `[^policy]` and a compact definition matching that source.
Do not add the verification block when only the source is known.

## Timestamps and migration

Every timestamp-valued key uses an ISO 8601 datetime with an explicit UTC offset
(§5), for example `2026-06-30T14:00:00Z` or `2026-06-30T09:00:00-05:00`. This
applies to `generated.at`, every `verified[].at`, `sources[].last_modified`,
both endpoints of shared and per-source `usage_window`, and `stale_after`.
Compare staleness as instants, preserving offsets and time of day. Quoted and
unquoted YAML timestamps have the same meaning. Reserved log headings remain
date-only `YYYY-MM-DD` (§9).

Earlier v0.2 snapshots used dates for `last_modified`, `usage_window`, and
`stale_after`. Recover actual times and offsets from evidence where possible.
A producer may define a documented conversion policy for date boundaries, but
do not silently append midnight UTC or present assumed precision as observed
provenance. If the intended instant is unknown, surface that uncertainty and
leave migration unresolved or omit the optional field when authorized. Changing
representation is not a new generation or verification event.

The bundled validator warns on invalid, date-only, or offset-free timestamps.
These remain optional-family findings under §11, separate from base conformance.
It does not infer staleness or elevate trust from malformed timestamps.

## Extensions and trust

Producers may add any other keys; consumers should preserve them when round-tripping
and must not reject documents for unrecognized fields (§4.1). Use that freedom sparingly — a
custom key no consumer reads is dead weight.

**Trust tiers** are derived, never stored: no `verified` key → unverified; `verified` by non-`human:`
actors only → machine-confirmed; at least one `human:<id>` → human-reviewed.

Valid historical verification does not establish that a later edit was checked.
With `--info`, the validator reports `verification-predates-content` when a valid
`generated.at` is later than every complete, valid verification event. It uses
the latest instant, regardless of list order or timezone, and leaves the tier
unchanged. Missing or invalid timestamps leave freshness unknown. A later
machine check does not constitute a new human review, even when an earlier
human event keeps the standard tier at human-reviewed. Inspect the actual events
when the distinction matters.

## Maintenance and identity

An OKF concept's ID is its bundle-relative path without `.md`. Before moving or
splitting a file, decide whether it is still the same concept or introduces a
distinct scope. Avoid identity changes solely to make a directory look tidy.

For example, suppose `guides/retry-event.md` is replaced by separate procedures
for undelivered events and missing acknowledgements:

1. Create the new concepts with distinct selection descriptions and enough
   context to use each independently. Attribute reused evidence truthfully;
   historical verification of the old scope does not automatically verify the
   newly authored concepts.
2. Keep `guides/retry-event.md` as a deprecated concept while old links are
   useful. Explain its former scope and link to both successors with conditions
   for choosing them. Do not create an invented redirect or tombstone field.
3. Update current index routes to the successors. Keep the deprecated concept
   reachable in a clearly described historical group; copy its updated title
   and description into that entry too.
4. Search the whole bundle for the old path and ID. Review incoming links,
   relative outgoing links affected by moves, `sources[].resource`, and other
   path-valued fields. Update known external callers when in scope, or record
   the remaining old routes. A filesystem rename alone is not a migration.
5. Update actual generation metadata, preserve verification history, and add a
   dated log entry explaining the change. Check both link conventions where
   supported and review the affected discovery routes using the old vocabulary.

When a source changes, follow its citations and dependent concepts to assess
the affected claims. Reconcile conflicting authority explicitly; neither the
newest timestamp nor a formatting repair decides which source governs. Preserve
qualifications and mark unresolved knowledge accurately until its owner resolves
it. Record a new verification only for the checks actually performed.

## Actor convention

Identity fields (`generated.by`, `verified[].by`) use exactly one of:

- `<producer>/<version>` — agents and tools, e.g. `reference_agent/gemini-2.5-pro`
- `human:<id>` — people, e.g. `human:ahormati`
- `process:<id>` — automated processes, e.g. `process:finance-nightly`

The `human:` prefix is load-bearing: it is what raises a concept to the human-reviewed tier. Use it
for hand-authored and human-confirmed content, and never for agent output.

`sources[].author` nominally uses the same convention, but the spec's own examples use a team form
(`team:finance-fpa`). Both are accepted; the validator only flags freeform values here.

