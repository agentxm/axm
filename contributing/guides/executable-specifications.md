# Authoring executable specifications

Every `*.spec.ts` states one requirement in the shared contract from
`@agentxm/specification-metadata`. A specification lives beside the source it
specifies, inside the project that owns that source; requirement identity,
statement, class, role, goals, and lineage carry the meaning, and the generated
[catalog](../../specifications/catalog.md) organizes them by meaning rather than
location. There is no central specification project and no application harness:
a specification runs in its owner's own test target — `test` for a library or
`apps/cli`, `e2e` for `apps/cli-e2e`.

Use the
[requirements-engineering guidance](../../agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/src/solution/requirements/index.md)
and
[designing executable specifications](../../agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/src/engineering/designing-executable-specifications.md)
for elicitation, review, impact analysis, and requirement changes. The
acceptance policy for this repository is the one below: the maintainer is the
acceptance authority, and a decision the maintainer records in the session or on
the pull request is the acceptance.

## Authority

- A specification on `main` is accepted authority.
- Merging the change that adds, revises, or removes a specification is the
  acceptance decision. A change to behavior lands its specification changes in
  the same change, written as final.
- An obligation not yet decided is not written. Record it as a work item or in
  the `openQuestions` of the nearest specification; never park it as a
  half-authoritative file.
- A successor retires every identity it `supersedes` in the same change; the
  conformance check rejects a successor whose predecessor is still present, so
  one obligation is never normative in two places.
- Execution produces evidence, never acceptance. A failing specification
  identifies disagreement between required and realized behavior; ordinary
  tests, prose, and implementation are witnesses.
- Obligations shared with the AgentXM platform are allocated to one corpus.
  Specify AXM's own conformance to a named contract version; never restate the
  other side's obligations. Keep private context out of this repository.

## Admission

A test earns the `*.spec.ts` suffix only when all four hold. Protecting a public
contract is necessary, not sufficient.

1. **A rule, not a mechanism.** The behavior was decided, and a different
   decision was available.
2. **Standing outside the author.** A person, another team, a downstream
   consumer, or an external protocol can contradict it.
3. **It outlives the implementation.** It survives a rewrite of whatever
   enforces it today.
4. **No existing specification owns it.** Two accepted statements of one rule
   is a duplicate authority, not a second opinion.

When the text was written does not decide admission: a rule specified after the
code is still a specification if someone with standing accepted it independently
of the code. Expected outcomes inferred from observed behavior are a
characterization test, not a specification.

Everything that fails admission is an ordinary `*.test.ts` beside the source, or
engineering policy enforced by adopted tooling. Structural and layout rules
belong to the Nx project graph, the placement plugin, and the
`@nx/enforce-module-boundaries` matrix in `eslint.config.mjs`, witnessed by
repository tests under `scripts/` — not to a specification.

## Placement

Colocate a specification beside the source that realizes it, under the owning
project's source root:

| Rule about                                            | Home                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| A library obligation                                  | `packages/<domain>/<package>/src/<area>/<name>.spec.ts` |
| CLI grammar, prompting, rendering, or exit behavior   | `apps/cli/src/...` beside the adapter it governs        |
| A process, binary, or install-boundary obligation     | `apps/cli-e2e/src/...` beside its execution binding     |
| An engineering-tool obligation with external standing | `tools/<library>/src/...`                               |

Discovery rejects a `*.spec.ts` outside an authored project's source root, in a
project that ships no runtime or end-to-end code, or inside `__generated__/`.

## Binding

A specification binds to its subject through the owning package's published
surface, never through private internals and never through a shared application
harness:

- **Root export.** Import the package under test by its package name
  (`@agentxm/workspace-operations`), not by a relative path into another
  package's `src`.
- **`./testing` port.** Test doubles, fixtures, and deterministic execution
  stubs that a specification needs from a _different_ package come from that
  package's `./testing` subpath (`@agentxm/workspace-state/testing`,
  `@agentxm/workspace-operations/testing`). A package that owes a seam to its
  consumers' specifications exports it there deliberately.
- **Owner-local fixtures.** Fixtures for the owning package's own
  specifications live beside them (`./testing.js`, `./test-helpers.js`) and stay
  unpublished.
- **CLI adapter specifications** use the application's own entry points
  (`axm.sh/app`, `axm.sh/runtime`); end-to-end specifications use the existing
  execution bindings in `apps/cli-e2e`.

A specification that can only be written by reaching past these surfaces is
describing a mechanism, not a rule — see [Admission](#admission).

## Metadata

Import `defineSpecification` (and `defineBoundEvidence` when needed) from
`@agentxm/specification-metadata`. Fields, in this order:

| Field            | Rule                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirement`    | Stable semantic identity: two or more kebab segments joined by `/`; independent of the file path and preserved when the file moves                                         |
| `title`          | Product language; no camelCase tokens or implementation words                                                                                                              |
| `statement`      | One normative sentence: subject, condition, required or prohibited outcome (`shall` / `shall not`)                                                                         |
| `class`          | `functional`, `quality`, `constraint`, `external-conformance`, `human-factors`, or `process`                                                                               |
| `characteristic` | Required for `quality` (for example `installability`, `compatibility`, `performance`, `security`); optional otherwise                                                      |
| `role`           | `experience`, `interface`, or `supporting`                                                                                                                                 |
| `goals`          | Shared identities from `sharedProductGoals` or local identities from `specifications/product-goals.ts`; never redefine a shared goal locally                               |
| `boundary`       | Defaults to `memory`; any other value requires `boundaryRationale` naming the evidence that boundary supplies                                                              |
| `methods`        | What the tests actually use (`example`, `property`, `contract`, `static`, `measurement`, …); `manual` or `review` for obligations that cannot run — reported as unverified |
| `selection`      | Defaults to `per-change`                                                                                                                                                   |
| `derivedFrom`    | Predecessor requirements, prior specification identities, witnessing tests, or surfaces; `[]` for an original                                                              |
| `supersedes`     | Identities this specification retires in the same change                                                                                                                   |
| `assumptions`    | Material presumptions the evidence does not establish, `[]` when none were found, or `"unknown"` when not assessed                                                         |
| `openQuestions`  | Unresolved meaning or scope, `[]` when none remain, or `"unknown"` when not reviewed                                                                                       |
| `limitations`    | Declared blind spots, each with a `retirementCondition`                                                                                                                    |

Metadata is literal-only; the catalog reads it statically.

## Requirement roles

Give every requirement one primary role: `experience` for behavior meaningful to
a person or agent completing an AXM task; `interface` for a public
machine-consumable contract; `supporting` for a subordinate system or
engineering obligation. Split independently promised experience and interface
behavior into separate requirements. Keep non-normative implementation detail in
ordinary `*.test.ts` tests beside the source.

## Recurring invariant families

Idempotency, preview purity, and preserved-unowned-state recur per command. Keep
them beside each owning feature with the shared names (`preview-is-pure`,
`*-is-idempotent`, `preserves-*`) and tag the matching product goal.
Cross-cutting views come from goal metadata, never from directories.

## Bound evidence

A specification whose decisive verification is a static gate declares
literal-only `boundEvidence` beside its `specification` constant. Bound evidence
supports the owning specification and never replaces it.

## Moves and identity

The `requirement` identity is stable and semantic; it is not derived from the
path. Moving a file preserves its identity and history: regenerate `catalog.md`
in the same change, and the verdict shows the file as `moved` when metadata,
decisive examples, and body are unchanged. Exactly one canonical `*.spec.ts`
exists per identity across every project; a second file fails discovery,
hygiene, and the catalog.

## The disposition ledger

Removing an identity is a requirements decision, and the verdict renders every
removal. `specifications/disposition-ledger.json` is where a removal is
explained: an array of entries, each naming the retired `requirement`, its
`disposition`, and a `basis` sentence.

| Disposition          | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `superseded-by`      | Another identity now states the rule; `successor` is required     |
| `engineering-policy` | The rule became a lint rule, graph constraint, or repository test |
| `converted-to-test`  | The text failed admission and is now an ordinary test             |
| `retired`            | The obligation no longer exists                                   |

An identity that disappears with no ledger entry still renders — as
`unexplained removal` — so the ledger is how a deliberate retirement is told
apart from an accident. Prefer `supersedes` in the successor's metadata when a
successor exists in the same change; use the ledger when the obligation leaves
the corpus. The ledger is append-only in practice: an entry is removed only when
the identity returns.

## Specification impact

Every change report and pull request ends with the specification impact rendered
by the verdict target: the added, removed, and revised requirement identities,
or the rendered "no requirement contract changes" line. The verdict is computed
against the merge base, so "none" is a result, not a claim.

```bash
pnpm exec nx run axm:specification-verdict -- --base "$(git merge-base main HEAD)"
```

## Validate

```bash
pnpm exec nx run axm:generate:specification-catalog   # discovery + conformance + catalog.md
pnpm exec nx run <owner>:test                         # the owner's specifications and tests
pnpm exec nx run cli-e2e:e2e                          # the process- and binary-boundary lane
pnpm test:spec --requirement <id>                     # evidence for one requirement, in its owner
pnpm exec nx run axm:verify-source-hygiene            # specification and test file rules
pnpm exec nx run axm:specification-verdict            # per-change requirement diff
```
