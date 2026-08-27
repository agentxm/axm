# Inspecting an established Gen Stack corpus

Use these read-only tools when a human, agent, or harness needs to understand
an established profile-governed `gen-stack/` corpus without reconstructing its
rules from Markdown files. They report only corpus-owned meaning and
policy-neutral candidates; they do not select required coverage, discover
implementation artifacts, execute concrete evaluations, judge Protocol
adequacy, or establish operational fitness.

## Preconditions

- Run from this package or use the paths shown below.
- Pass the adopting repository root, not its `gen-stack/` directory.
- The repository must already contain a supported corpus at `gen-stack/` for
  operations other than `status`, `validate`, and snapshot `diff`.
- Python 3 and PyYAML must be available, matching the existing profile tools.

The examples use `<repository-root>` as a placeholder. Do not replace it with
a corpus path.

## Check availability

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> status
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> validate
```

`status` distinguishes `absent`, `unsupported`, `invalid`, and `conforming`
and reports which operations are eligible. `validate` keeps OKF conformance,
structural profile validation, semantic review, and coverage or fitness as
separate results.

Use `--json` before the subcommand for the complete versioned envelope:

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> --json status
```

## Find and inspect concepts

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> list surfaces
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> list structure
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> list requirements
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> search installation recovery
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> show SYN-REQ-0042
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> \
  show /architecture/surfaces/cli/install.md requirements
```

`show` accepts a canonical bundle-relative concept path or stable Requirement
ID. Its natural views are `requirements`, `children`, `lineage`, `relations`,
and `source` when applicable. This avoids encoding graph traversal in a set of
relation flags.

The `requirements` view returns only Requirements directly assigned to the
subject. It never treats a parent Requirement as inherited by a child.

## Give a harness evaluation context

Request the complete corpus projection:

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> --json evaluation-context
```

Or scope it to one eligible Architecture subject:

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> --json evaluation-context \
  /architecture/surfaces/cli/install.md
```

The result coordinates:

- recursive Surface interaction hierarchy;
- C4 Software System → Container → Component hierarchy;
- active and retired direct Requirements;
- explicit cross-view mappings;
- C4 Views as context, never evaluation subjects;
- separate ancestor context for scoped inspection; and
- governed Evaluation Protocols and System Assurance guidance.

Use this structure to inform evaluation subjects, claims, scenarios, and
navigation. Keep executable Suites in their repository-native organization.
Protocol presence is projected, but the operation does not assert Protocol
coverage, evidence currency, an outcome, or implementation realization.

## Derive policy-neutral evaluation candidates

Request eligible role-and-target pairs for the complete corpus:

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> --json evaluation-candidates
```

Or scope the projection to one eligible Architecture authority:

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py \
  -C <repository-root> --json evaluation-candidates \
  /architecture/surfaces/cli/install.md
```

The result includes active, directly assigned Requirement candidates;
eligible Architecture-authority candidates; explicit cross-view scope;
matching active and retired Protocols; retired-Requirement and C4 View
exclusions; and ancestor context. Complete-corpus output also includes
Implementation Units already declared by active implementation-conformance
Protocols. It cannot discover uncovered Implementation Units.

Candidate projection is decision support. A candidate is eligible for
consideration, not automatically selected or required. A Protocol match is
not a claim of adequacy, executable realization, evidence currency, outcome,
assurance, or release authorization. Apply an identified local policy or
authority outside this operation before interpreting selected candidates as
`defined` or `uncovered` Protocol Coverage. See [Deriving evaluation coverage
in harnesses](../src/evaluations/deriving-evaluation-coverage-in-harnesses.md).

## Explain and compare corpus meaning

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> \
  path /architecture/features/install.md \
  /architecture/structure/containers/api/components/installer.md
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> \
  why edge:0123456789abcdef
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> \
  affected-concepts SYN-REQ-0042
```

`path` traverses controlled relationships in either navigational direction.
`why` identifies path-derived identity or a relationship's authoritative
assertion. `affected-concepts` reports relationship reachability only—not
implementation, evaluation, delivery, or operational impact.

Create and compare deterministic snapshots:

```bash
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> snapshot \
  > before.json
python3 knowledge/gen-stack/scripts/gen-stack.py -C <repository-root> snapshot \
  > after.json
python3 knowledge/gen-stack/scripts/gen-stack.py --json diff before.json after.json
```

## Machine contract and exit behavior

The [contract reference](contracts/README.md),
[current JSON Schema](contracts/gen-stack-inspection-v1alpha2.schema.json),
[evaluation-context example](contracts/evaluation-context.example.json), and
[evaluation-candidates example](contracts/evaluation-candidates.example.json)
define the machine surface.

The CLI exits zero for a successful eligible query. Validation failure,
ineligible operations, unresolved references, missing graph paths, and invalid
snapshot inputs exit nonzero. `status` remains readable in every discovery
state; consumers should still inspect `discovery.state` and diagnostics rather
than treating an empty result as usable.

Inspection commands never write the corpus. Relationship synchronization
remains the separate, explicitly mutating `sync-gen-stack-relationships.py`
workflow.
