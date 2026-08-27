# Gen Stack inspection contract reference

Use this reference when consuming machine-readable output from
`gen-stack.py`. For task-oriented commands, see the [inspection
guide](../README.md).

## Contract

Every current operation returns a
[`gen-stack-inspection/v1alpha2`](gen-stack-inspection-v1alpha2.schema.json)
envelope. The schema is JSON Schema 2020-12. The
[evaluation-context example](evaluation-context.example.json) and
[evaluation-candidates example](evaluation-candidates.example.json) use only
public synthetic data. The superseded
[`v1alpha1` schema](gen-stack-inspection-v1alpha1.schema.json) remains available
for consumers of retained output; it does not describe current producer output.

The envelope always carries:

| Field | Meaning |
| --- | --- |
| `schema_version` | Consumer compatibility boundary. |
| `producer` | Tool version and digest of the Python inspection package. |
| `snapshot` | Profile identity plus deterministic corpus and snapshot digests. |
| `discovery` | Fixed-location state and separately reported OKF, structural, and semantic results. |
| `operation` | Operation that produced `data`. |
| `data` | Operation-specific result. |
| `diagnostics` | Stable rules, severity, repository-relative paths, and blocking state. |
| `unknowns` | Claims the operation intentionally did not establish. |
| `output_digest` | Digest of the envelope before this field is added. |

`snapshot_id` identifies the profile and corpus contents. `output_digest`
also changes when the operation, producer, diagnostics, unknowns, or projected
data change.

## Discovery and conformance

`discovery.state` is one of `absent`, `unsupported`, `invalid`, or
`conforming`. `conforming` means executable structural profile validation
passed. It does not make `okf_result`, `semantic_result`, coverage, satisfaction,
or fitness pass.

An unavailable corpus is never represented as an empty successful corpus.
Queries return an `operation-ineligible` diagnostic instead.

## Concept identity

Most concepts use bundle-relative OKF path references beginning with `/`.
Requirements can also be resolved by stable `requirement_id`, and Evaluation
Protocols by stable `protocol_id`.
Source paths in outputs begin with `gen-stack/` and never contain the local
absolute repository path.

## Relationships

Each controlled relationship has a stable `edge:…` reference, canonical
relationship identifier, endpoints, readable roles, assertion source, and
`asserted` or `derived` provenance. A relationship produced from Surface or
C4 Component placement is `derived`; a reciprocal frontmatter projection does
not become a second assertion.

Ordinary Markdown links do not create controlled relationships.

## Evaluation context

`evaluation-context` contains:

- recursive `surfaces` and C4 `structure` hierarchies;
- `direct_requirements` on each hierarchy node;
- a Requirement map containing expressions, rationale, lifecycle, lineage,
  source, and digest;
- separate `ancestor_context` for a scoped request;
- explicitly asserted `cross_view_mappings`;
- C4 Views labeled as non-evaluation subjects; and
- governed Evaluation Protocol and System Assurance sources.

It never computes inherited Requirements, physical suite layout,
implementation realization, Protocol coverage, evidence state, or outcomes.

## Evaluation candidates

`evaluation-candidates` projects policy-neutral role-and-target pairs. It
includes matching active and retired Protocol summaries while retaining these
separate questions:

- candidate eligibility;
- selection by an adopting policy or authority;
- presence of an applicable active Protocol;
- semantic adequacy of that Protocol;
- local executable realization; and
- evidence state and bounded outcome.

Active Requirements become candidates only through their direct subject
assignment. Eligible Architecture authorities become architecture-realization
candidates; C4 Views remain excluded projections. Complete-corpus inspection
can expose Implementation Units already named by active Protocols, but cannot
discover uncovered Units. The composite of `role` and `protocol_target`
identifies a candidate within the bound snapshot; the operation does not mint
a governed candidate identity.

## Snapshot and diff

A `snapshot` contains complete governed concept views and canonical controlled
relationships in deterministic order. Redirect the complete JSON envelope to
a file and provide two such files to `diff`.

Diff identity follows corpus identity: a concept path move appears as removal
and addition. The comparison is limited to the governed corpus and must not be
interpreted as realized software, evaluation, delivery, or operational impact.
