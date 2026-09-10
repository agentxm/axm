# Authoring specifications

Every `*.spec.ts` states one requirement in the shared contract from
`@agentxm/specification-metadata`. Files live beside the source they govern,
inside the project that owns that source; requirement identity, statement,
class, role, goals, and lineage carry the meaning, and the generated
[catalog](catalog.md) organizes them by meaning rather than location.

Use the [requirements-engineering guidance](../agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/src/solution/requirements/index.md)
for elicitation, review, impact analysis, and requirement changes. The acceptance
policy for this repository is the one below: the maintainer is the acceptance authority, and
a decision the maintainer records in the session or on the pull request is
the acceptance.

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
  Specify AXM's own conformance to a named contract version; never restate
  the other side's obligations. Keep private context out of this tree.

## Specification impact

Every change report and pull request ends with the specification impact
rendered by the verdict target: the added, removed, and revised requirement
identities, or the rendered "no requirement contract changes" line. The
verdict is computed against the merge base, so "none" is a result, not a
claim.

```bash
pnpm exec nx run axm:specification-verdict -- --base "$(git merge-base main HEAD)"
```

## Metadata

Import `defineSpecification` (and `defineBoundEvidence` when needed) from the
shared contract. Fields, in this order:

| Field            | Rule                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirement`    | Stable semantic identity: two or more kebab segments joined by `/`; independent of the file path and preserved when the file moves                                         |
| `title`          | Product language; no camelCase tokens or implementation words                                                                                                              |
| `statement`      | One normative sentence: subject, condition, required or prohibited outcome (`shall` / `shall not`)                                                                         |
| `class`          | `functional`, `quality`, `constraint`, `external-conformance`, `human-factors`, or `process`                                                                               |
| `characteristic` | Required for `quality` (for example `installability`, `compatibility`, `performance`, `security`); optional otherwise                                                      |
| `role`           | `experience`, `interface`, or `supporting`                                                                                                                                 |
| `goals`          | Shared identities from `sharedProductGoals` or local identities from `product-goals.ts`; never redefine a shared goal locally                                              |
| `boundary`       | Defaults to `memory`; any other value requires `boundaryRationale` naming the evidence that boundary supplies                                                              |
| `methods`        | What the tests actually use (`example`, `property`, `contract`, `static`, `measurement`, …); `manual` or `review` for obligations that cannot run — reported as unverified |
| `selection`      | Defaults to `per-change`                                                                                                                                                   |
| `derivedFrom`    | Predecessor requirements, prior specification identities, witnessing tests, or surfaces; `[]` for an original                                                              |
| `supersedes`     | Identities this specification retires in the same change                                                                                                                   |
| `assumptions`    | Material presumptions the evidence does not establish, `[]` when none were found, or `"unknown"` when not assessed                                                         |
| `openQuestions`  | Unresolved meaning or scope, `[]` when none remain, or `"unknown"` when not reviewed                                                                                       |
| `limitations`    | Declared blind spots, each with a `retirementCondition`                                                                                                                    |

Metadata is literal-only; the catalog reads it statically.

## Placement

Colocate a specification beside the source that realizes it, under the
owning project's source root: a library rule in
`packages/<domain>/<package>/src/<area>/<name>.spec.ts`, a CLI grammar,
prompt, rendering, or exit rule in `apps/cli/src/...` beside the adapter, and
a process- or binary-boundary rule in `apps/cli-e2e/src/` beside its
execution binding. Only projects that ship runtime code, end-to-end projects,
and this retiring catalog project may own specifications; discovery rejects a
`.spec.ts` anywhere else, outside its owner's source root, or inside
`__generated__/`. Specifications not yet moved stay under this directory until
their owner adopts them.

## Requirement roles

Give every requirement one primary role: `experience` for behavior meaningful
to a person or agent completing an AXM task; `interface` for a public
machine-consumable contract; `supporting` for a subordinate system or
engineering obligation. Split independently promised experience and interface
behavior into separate requirements. Keep non-normative implementation detail
in ordinary `*.test.ts` tests beside the source.

## Recurring invariant families

Idempotency, preview purity, and preserved-unowned-state recur per command.
Keep them beside each owning feature with the shared names
(`preview-is-pure`, `*-is-idempotent`, `preserves-*`) and tag the matching
product goal. Cross-cutting views come from goal metadata, never from
directories.

## Bound evidence

A specification whose decisive verification is a static gate declares
literal-only `boundEvidence` beside its `specification` constant. Bound
evidence supports the owning specification and never replaces it.

## Moves and identity

The `requirement` identity is stable and semantic; it is not derived from the
path. Moving a file preserves its identity and history: regenerate
`catalog.md` in the same change, and the verdict shows the file as `moved`
when metadata, decisive examples, and body are unchanged. Exactly one
canonical `*.spec.ts` exists per identity across every project; a second file
fails discovery, hygiene, and the catalog. Renaming an identity is a
requirements decision: the successor lists the old identity in `supersedes`,
or `disposition-ledger.json` beside this file records why the identity was
removed (`converted-to-test`, `engineering-policy`, `retired`, or
`superseded-by` with a successor); an unexplained removal still renders,
visibly, in the verdict.

## Validate

```bash
pnpm exec nx run axm:generate:specification-catalog   # discovery + conformance + catalog.md
pnpm exec nx run <owner>:test                         # the owner's specifications and tests
pnpm test:spec --requirement <id>                     # evidence for one requirement, in its owner
pnpm exec nx run axm:verify-source-hygiene            # specification and test file rules
pnpm exec nx run axm:specification-verdict            # per-change requirement diff
```
