---
name: author-okf
description: >-
  Authors, reviews, converts, maintains, and validates Open Knowledge Format (OKF) v0.2 knowledge
  bundles and application profiles. Use when creating or assessing an OKF bundle, concept document,
  profile rule, reserved index.md or log.md, provenance / trust / lifecycle frontmatter, or Attested
  Computation; converting existing material into OKF; or checking base and profile conformance.
  Triggers on: OKF, Open Knowledge Format, knowledge bundle, concept document, OKF application
  profile, profile conformance, okf_version, attested computation. Not for generic documentation
  organization when OKF is not declared.
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
6. **Keep conformance layers separate.** An application-profile failure does not make a bundle
   non-conformant with OKF v0.2.
7. **A profile cannot turn a reserved file into a concept.** A profile may require an `index.md` or
   `log.md` and constrain its specified structure, but it cannot assign either file a concept type,
   concept identity, semantic ownership, or concept-level provenance and lifecycle metadata while
   retaining OKF v0.2 conformance. Put durable knowledge in a non-reserved concept document and let
   the index link to it.
8. **A representation repair is not a domain decision.** When separating durable meaning from a
   reserved file, preserve the proposal's authority boundaries. Do not thereby accept its concept
   type, canonical path, cardinality, corpus-inclusion policy, or claimed ownership of neighboring
   artifacts. Name those as unresolved choices for the applicable profile or domain authority.

## Progressive discovery

Design discovery outside-in so each surface gives a human or agent only enough information to
choose the next useful surface. Then verify inside-out that every narrower surface fulfills the
promise made above it.

| Surface | Reader decision | Authoring contract |
|---|---|---|
| Publisher or catalog metadata, when present | Is this bundle relevant? | One sentence naming the domain and distinctive scope; for an AXM package this is `knowledge.json.description`. |
| Root `index.md` | Where should I begin? | Bundle title, a short scope-and-use introduction, then the major reader-facing routes. |
| Nested `index.md` | Which part of this area matters? | State the grouping principle and enumerate the immediate concepts or narrower sections. |
| Concept preview or search result | Is this the exact concept? | Distinctive `title` and `description`, stable `type`, and query vocabulary in `tags`. |
| Concept body | What knowledge applies? | The detail promised by its metadata, organized for reading and retrieval. |

Browsing and search are parallel routes. Indexes support browsing; concept metadata must stand on
its own when search bypasses every index.

For repository-level collection paths, filenames, and titles that OKF does not prescribe, apply
the repository's documentation naming and information-architecture guidance. This skill owns OKF
conformance and bundle coherence, not the host repository's documentation taxonomy.

- Let each description become more specific: bundle scope → section scope → concept distinction.
  Do not repeat one generic description at every level.
- For an action-oriented concept such as a Guide, procedure, playbook, runbook, or Process, make
  the description support selection before opening: pair the supported outcome with the observable
  situation, event, symptom, or reader intent that makes it relevant. A Process preview names its
  triggering condition and intended closing outcome. Keep access, knowledge, input, and state
  preconditions distinct from both selection conditions and Process triggers; do not invent a new
  metadata field for any of these concerns.
- Treat `title` as a concept's canonical display name. Use it exactly as index link text and,
  normally, as the document-title heading; use a stable slug for the filename. Keep conventional
  headings such as `# Computation` when the spec assigns them meaning.
- Copy a concept's `description` into its index entry. For a subdirectory entry, describe what that
  section contains and how it differs from its siblings.
- Organize indexes by distinctions readers recognize, not incidental storage or source layout.
  Add a nested index when one page mixes different reader questions or becomes hard to scan, not
  merely after an arbitrary file count.
- Keep substantive knowledge out of indexes, and keep every concept reachable from the root
  through meaningful index entries.

## Workflows

### Create a new bundle

1. Confirm the bundle root, audience, scope, important exclusions, and top-level grouping with the
   user. Directories are a domain choice, not a spec choice (`tables/`, `metrics/`, `playbooks/`).
2. Draft the one-sentence publisher description when the bundle has one, then sketch the root and
   any nested indexes from `templates/index.md`. This is the discovery map, not final content.
3. Create concepts from `templates/concept.md`, following [Sources and claim attribution](#sources-and-claim-attribution).
   Use one file per concept. Concept ID is the bundle-
   relative path minus `.md`; reconcile each finished body with its drafted title and description.
4. Finish the root `index.md` with `okf_version: "0.2"` and the exact concept titles and
   descriptions. This is the only `index.md` permitted to have frontmatter.
5. Start `log.md` at the root with an initialization entry (`templates/log.md`).
6. Walk the bundle once from the root index and once by likely search terms, then validate.

### Convert existing material into OKF

1. **Inventory first.** List the source material and decide the concept split before writing
   anything. One source document often becomes several concepts; resist a 1:1 mapping.
2. **Draft the discovery map.** State the bundle's promise, group the concepts by reader-recognizable
   distinctions, and draft a title plus one-sentence description for each concept.
3. **Assign types** from the existing bundle's vocabulary, or mint a small starter set and write it
   down. Do not let each file invent its own.
4. **Record provenance honestly.** Each converted concept gets a `sources` entry whose `resource`
   is the material it came from — an absolute URL, a bundle-relative path, or a scope descriptor
   like `all queries in BigQuery project X` when there is no single artifact. Give each source an
   `id` when the body cites it.
5. **Attribute per claim** using [Sources and claim attribution](#sources-and-claim-attribution).
6. **Set `generated`** to the actor that actually did the conversion, e.g.
   `generated: { by: claude/opus-5, at: <now, ISO 8601> }`. Do not set `verified` — conversion is
   generation, not verification. A human reviewer adds `verified` afterwards.
7. Prefer structural markdown (tables, lists, fenced blocks) over prose paragraphs. Both humans and
   retrieval do better with structure.
8. Reconcile the completed concepts with the discovery map, walk both browse and search routes, and
   validate.

### Extend or maintain an existing bundle

**Read before writing.** Discover any declared application profile, then scan the bundle for its
existing `type` values, directory conventions, and actor strings. Follow the profile when one
exists; otherwise match established bundle conventions. When a profile applies, read
`references/application-profiles.md` before changing its types, metadata, paths, relationships, or
validation rules. The validator's `--summary` prints the type inventory:

```bash
python3 scripts/validate_okf.py <bundle> --summary
```

Then:

- Apply [Sources and claim attribution](#sources-and-claim-attribution) when adding or revising citations.
- Update `generated.at` when content changes meaningfully. Leave `verified` alone — content can
  change without re-confirmation, and stale `verified` entries are informative, not errors.
- Add a `verified` entry only on an actual verification event. Append to the list; do not overwrite.
- Refresh `stale_after` only when the content was genuinely re-confirmed.
- Mark superseded concepts `status: deprecated` rather than deleting them — inbound links survive.
- Update the enclosing `index.md`; if bundle scope changed, also update the root introduction and
  any publisher description. Append a dated `log.md` entry in the same change.
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

The bundled validator checks OKF v0.2 and general authoring hazards; it does not enforce arbitrary
producer application profiles. When a profile applies, run its validator when one exists and
report **OKF conformance** and **profile conformance** separately. Never classify a profile-only
violation as an OKF specification error. If no executable profile validator exists, label the
profile review as manual and name the rules checked. Read `references/application-profiles.md` when
defining, applying, or validating a profile.

### Review a proposed profile or bundle representation

Read and follow [Representation review](references/application-profiles.md#review-a-proposed-profile-or-bundle-representation)
before assessing a proposal. Apply base reserved-file rules first, preserve peer
ownership, and leave proposed domain types, paths, and profile-policy choices to
the applicable authority; representation compatibility does not accept them.

## Sources and claim attribution

Record provenance in `sources`. Attribute individual claims with footnotes whose
labels match `sources[].id`, following OKF §5.1. Consumers resolve attribution
through that ID, not the footnote prose. Keep footnote definitions for Markdown
readability. Apply this convention during creation, conversion, and maintenance.

These are authoring defaults, not additional OKF conformance rules; follow an
explicit audience need or applicable profile when it calls for another form:

- Keep source identity and URLs in frontmatter.
- Default definitions to a short source title; add an author when needed to
  distinguish sources.
- Use a compact linked title when readers need direct source access from rendered
  Markdown. Keep its URL consistent with `sources[].resource`.
- Add a section locator, qualification, or indirect-attribution explanation only
  when it helps readers assess the cited claim.
- Omit source synopses that repeat the body. Preserve qualifications that affect
  interpretation; shortening a citation must not strengthen its evidence claim.
- Reuse the same source ID for further claims supported by that source. Do not
  create a separate bibliography alongside `sources`.

For a source declared with `id: sbe` and `title: Specification by Example`:

```markdown
Examples illustrate rules but cannot alone establish correctness.[^sbe]

[^sbe]: Fowler, Specification by Example.
```

## Frontmatter reference

Read [Frontmatter reference](references/frontmatter.md) when choosing field forms,
recording provenance or lifecycle metadata, or interpreting actors and trust tiers.
`type` remains the only always-required key; optional metadata must be truthful.

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
bundle-root `index.md` may carry `okf_version: "0.2"`. Open with a title and short scope-and-use
introduction, then use headed groups of link entries. Concept titles and descriptions should match
their frontmatter; subdirectory descriptions should distinguish the section from its siblings.

```markdown
# Bundle or section title

Short statement of scope, intended use, and important boundaries.

## Reader-facing group

* [Exact concept title](relative-url) - exact concept description
* [Section title](subdir/) - what belongs in this section and distinguishes it
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

Finish with `python3 scripts/validate_okf.py <bundle-root>` (requires PyYAML).
It exits non-zero on errors. Fix spec violations; weigh advisory findings on
their merits. See [Validate or audit a bundle](#validate-or-audit-a-bundle) for
reporting and profile checks.
