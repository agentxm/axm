---
name: okf-author
description: >-
  Author, convert, maintain, and validate Open Knowledge Format (OKF) v0.2 knowledge bundles —
  directory trees of markdown concept documents with YAML frontmatter. Use when creating an OKF
  bundle or concept document, converting existing docs / wiki pages / data-catalog metadata into
  OKF, adding or updating concepts in an existing bundle, writing index.md or log.md, authoring an
  Attested Computation, setting provenance / trust / lifecycle frontmatter (sources, generated,
  verified, status, stale_after), or checking a bundle for conformance. Triggers on: OKF, Open
  Knowledge Format, knowledge bundle, concept document, okf_version, attested computation.
---

# Authoring OKF bundles

OKF v0.2 represents knowledge as a directory of markdown files with YAML frontmatter. No schema
registry, no central authority, no required tooling. This skill covers producing conformant bundles
and keeping them coherent as they grow.

The full spec is vendored at `references/SPEC.md` (pinned to upstream commit `3fcbb9f`, retrieved
2026-07-27). Read it for Attested Computation details (§10), the v0.1 migration (§13), or any
question this file does not answer. Do not fetch the spec from the network — the vendored copy is
the version this skill targets.

## Invariants

1. **Every non-reserved `.md` file has parseable YAML frontmatter with a non-empty `type`.** This is
   the whole of conformance, along with reserved-file structure. Nothing else can make a bundle
   non-conformant.
2. **`index.md` and `log.md` are reserved at every directory level.** Never author a concept under
   either name.
3. **Reuse `type` values that already exist in the bundle.** See [Type discipline](#type-discipline).
4. **Run the validator before declaring work done.** See [Validate](#validate).
5. **Never invent provenance.** `sources`, `generated.by`, and `verified` are trust claims. Record
   what actually happened; omit the field when you do not know. Absence is meaningful and always
   permitted — a fabricated `verified: { by: human:... }` entry is worse than no entry.

## Workflows

### Create a new bundle

1. Confirm the bundle root and the top-level grouping with the user (directories are a domain
   choice, not a spec choice — `tables/`, `metrics/`, `playbooks/`, `computations/`).
2. Create concepts from `templates/concept.md`, one file per concept. Concept ID is the bundle-
   relative path minus `.md`.
3. Write a bundle-root `index.md` from `templates/index.md`, carrying `okf_version: "0.2"`. This is
   the only `index.md` permitted to have frontmatter.
4. Add `index.md` per subdirectory once it holds more than a handful of concepts.
5. Start `log.md` at the root with an initialization entry (`templates/log.md`).
6. Validate.

### Convert existing material into OKF

1. **Inventory first.** List the source material and decide the concept split before writing
   anything. One source document often becomes several concepts; resist a 1:1 mapping.
2. **Assign types** from the existing bundle's vocabulary, or mint a small starter set and write it
   down. Do not let each file invent its own.
3. **Record provenance honestly.** Each converted concept gets a `sources` entry whose `resource`
   is the material it came from — an absolute URL, a bundle-relative path, or a scope descriptor
   like `all queries in BigQuery project X` when there is no single artifact. Give each source an
   `id` when the body cites it.
4. **Attribute per claim** with footnotes keyed to `sources[].id`, not a citations list:

   ```markdown
   The `events_` table is sharded daily as `events_YYYYMMDD`.[^ga4-schema]

   [^ga4-schema]: GA4 BigQuery Export schema
   ```

5. **Set `generated`** to the actor that actually did the conversion, e.g.
   `generated: { by: claude/opus-5, at: <now, ISO 8601> }`. Do not set `verified` — conversion is
   generation, not verification. A human reviewer adds `verified` afterwards.
6. Prefer structural markdown (tables, lists, fenced blocks) over prose paragraphs. Both humans and
   retrieval do better with structure.
7. Validate.

### Extend or maintain an existing bundle

**Read before writing.** Scan the bundle for its existing `type` values, directory conventions, and
actor strings, and match them. The validator's `--summary` prints the type inventory:

```bash
python3 scripts/validate_okf.py <bundle> --summary
```

Then:

- Update `generated.at` when content changes meaningfully. Leave `verified` alone — content can
  change without re-confirmation, and stale `verified` entries are informative, not errors.
- Add a `verified` entry only on an actual verification event. Append to the list; do not overwrite.
- Refresh `stale_after` only when the content was genuinely re-confirmed.
- Mark superseded concepts `status: deprecated` rather than deleting them — inbound links survive.
- Update the enclosing `index.md` and append a dated `log.md` entry in the same change.
- Validate.

### Validate or audit a bundle

```bash
python3 scripts/validate_okf.py <bundle>              # errors + warnings
python3 scripts/validate_okf.py <bundle> --info       # also recommended-field gaps
python3 scripts/validate_okf.py <bundle> --summary    # type inventory, trust tiers, staleness
python3 scripts/validate_okf.py <bundle> --json       # machine-readable
```

Report findings by severity and fix `error` findings before reporting done. Weigh `warn` findings
on their merits — several are advisory by design (broken links are explicitly legal per §11).

## Frontmatter reference

`type` is the only always-required key. A concept carrying just `type` is fully conformant.

| Field | Req | Form | Notes |
|---|---|---|---|
| `type` | **yes** | string | Kind of concept. Uncontrolled vocabulary — see [Type discipline](#type-discipline). |
| `title` | rec | string | Display name. Consumers may fall back to the filename. |
| `description` | rec | string | One sentence. Feeds `index.md` entries and search snippets. |
| `resource` | rec | URI/path | Canonical URI of the underlying asset. Omit for abstract concepts. |
| `tags` | rec | list | Short strings, cross-cutting. |
| `sources` | opt | list | Provenance. Each entry needs `resource`; `id`, `title`, `author`, `usage_count`, `last_modified` optional. |
| `usage_window` | opt | `{from, to}` | Sibling of `sources`; frames every `usage_count`. Dates are `YYYY-MM-DD`. |
| `generated` | opt | `{by, at}` | `by` required within it; an actor. `at` = last meaningful content change, ISO 8601 datetime. |
| `verified` | opt | list of `{by, at}` | Verification events. A bare mapping is a one-element list. |
| `status` | opt | enum | `draft` \| `stable` \| `deprecated`. Absent means `stable`. |
| `stale_after` | opt | `YYYY-MM-DD` | Absolute date, not a TTL. Stale when `today >= stale_after`. |

Producers may add any other keys; consumers must preserve them. Use that freedom sparingly — a
custom key no consumer reads is dead weight.

**Trust tiers** are derived, never stored: no `verified` key → unverified; `verified` by non-`human:`
actors only → machine-confirmed; at least one `human:<id>` → human-reviewed.

### Actor convention

Identity fields (`generated.by`, `verified[].by`) use exactly one of:

- `<producer>/<version>` — agents and tools, e.g. `reference_agent/gemini-2.5-pro`
- `human:<id>` — people, e.g. `human:ahormati`
- `process:<id>` — automated processes, e.g. `process:finance-nightly`

The `human:` prefix is load-bearing: it is what raises a concept to the human-reviewed tier. Use it
for hand-authored and human-confirmed content, and never for agent output.

`sources[].author` nominally uses the same convention, but the spec's own examples use a team form
(`team:finance-fpa`). Both are accepted; the validator only flags freeform values here.

## Type discipline

`type` is deliberately not centrally registered, which means an unguided author produces
`BigQuery Table`, `BQ Table`, and `Table` in three files of the same bundle. That costs consumers
their routing and filtering.

Before adding a concept, list the types already in use (`--summary`) and reuse an exact match. Mint
a new type only when nothing fits, and prefer a descriptive, self-explanatory noun phrase in title
case. The validator flags near-duplicate types that differ only in case, spacing, or punctuation.

Common starting values: `BigQuery Table`, `BigQuery Dataset`, `API Endpoint`, `Metric`, `Playbook`,
`Reference`, `Attested Computation`.

## Links and paths

Prefer **bundle-relative** links beginning with `/` — they survive a document moving within its
subdirectory:

```markdown
See the [customers table](/tables/customers.md) for the join key.
```

Relative links (`./other.md`) are also valid. Links are untyped: the relationship kind lives in the
surrounding prose, not the link. Consumers must tolerate broken links, so a link to a not-yet-written
concept is legitimate — the validator reports these as warnings so you can tell intent from typo.

Path-valued fields (`resource`, `sources[].resource`, `computation`, `executor.resource`,
`attester.resource`) accept an absolute URL, a bundle-relative path, or a relative path. A
`references/` subdirectory conventionally holds mirrored external material, run instructions, and
attester code as first-class bundle files.

## Reserved files

**`index.md`** — optional at any level, supports progressive disclosure. No frontmatter, except a
bundle-root `index.md` may carry `okf_version: "0.2"`. Body is one or more headed sections of link
entries; descriptions should match the linked concept's `description`.

```markdown
# Section Heading

* [Title](relative-url) - short description
* [Subdirectory](subdir/) - short description
```

**`log.md`** — optional at any level, newest first. `##` headings **must** be ISO `YYYY-MM-DD`. The
leading bold word is convention, not requirement.

```markdown
# Directory Update Log

## 2026-05-22
* **Update**: Added a BigQuery table reference for [Customer Metrics](/tables/customer-metrics.md).
* **Creation**: Established the [Dataplex Playbook](/playbooks/dataplex.md).
```

## Attested Computation

A concept of `type: Attested Computation` carries a sanctioned computation so a consumer can confirm
the blessed thing ran rather than agent-improvised SQL. Start from
`templates/attested-computation.md` and read `references/SPEC.md` §10 — the contract has real
subtleties this summary omits.

Essentials: `runtime` is **required** for this type (`bigquery`, `postgres`, `dbt`, `python`,
`Looker`, …) and defines what `parameters` mean. Supply the computation *either* inline as one fenced
block under `# Computation` *or* via a `computation:` path — never both. `executor.resource` names
run instructions and `executor.receipt` lists the fields a run must return; `attester.resource`
names deterministic, no-LLM verification code.

One rule matters above the rest: **an agent may only supply parameter *values*. It must never
author or edit the computation.** That parameter-only surface is what makes attestation a mechanical
comparison instead of a judgement call. If a computation looks wrong, say so — do not rewrite it.

Keep each figure its own Attested Computation concept and link to it from the narrative concept that
uses it; revenue and profit verify, go stale, and attest independently.

## Validate

Always finish by running the validator over the bundle root:

```bash
python3 scripts/validate_okf.py <bundle-root>
```

It needs PyYAML (`pip install pyyaml`) and exits non-zero when errors are present. `error` findings
are spec violations — fix them. `warn` and `info` findings are producer SHOULDs and authoring
hazards; judge each one rather than silencing it reflexively.
