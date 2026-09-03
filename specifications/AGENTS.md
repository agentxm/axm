# Authoring specifications

Every `*.spec.ts` states one requirement in the shared contract from
`@agentxm/extension-model/unstable/specifications`. Directories are physical
layout; requirement identity, statement, class, role, status, goals, and
lineage carry the meaning.

Use the installed `engineer-requirements` skill for elicitation, review,
impact analysis, and requirement changes. Its acceptance policy for this
repository is the one below: the maintainer is the acceptance authority, a
decision the maintainer records in the session or on the pull request is the
acceptance, and the skill never authors a candidate or defers a decided change.

## Authority

- A specification on `main` is accepted authority. There is no other status:
  the contract has no lifecycle field, and the decoder rejects one.
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
| `requirement`    | Equals the file path under `specifications/` without `.spec.ts`                                                                                                            |
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

The tree under `cli/` mirrors the registered CLI command tree. Place a spec at
the command node it is about; if it quantifies over several commands, place it
at their nearest common ancestor (whole-surface and workspace-state invariants
sit directly in `cli/`). Folders exist only for commands that exist
(`system/architecture/specification-folders-mirror-command-tree` enforces
this).

Library requirements go under a top-level product concept area
(`extension-identity/`, `package-identity/`, `settings-contract/`,
`source-resolution/`, `version-constraints/`); repository, release, and
platform requirements under `system/<area>/`.

## Requirement roles

Give every requirement one primary role: `experience` for behavior meaningful
to a person or agent completing an AXM task; `interface` for a public
machine-consumable contract; `supporting` for a subordinate system or
engineering obligation. Split independently promised experience and interface
behavior into separate requirements. Keep non-normative implementation detail
in internal tests.

## Recurring invariant families

Idempotency, preview purity, and preserved-unowned-state recur per command.
Keep them in each command's folder with the shared names (`preview-is-pure`,
`*-is-idempotent`, `preserves-*`) and tag the matching product goal.
Cross-cutting views come from goal metadata, never duplicate directories.

## Bound evidence

A specification whose decisive verification is a static gate declares
literal-only `boundEvidence` beside its `specification` constant. Bound
evidence supports the owning specification and never replaces it.

## Set reviews

A change that re-derives a subject's specifications from sources may record a
set review under `reviews/`: boundary, baseline revision, source set,
exclusions, and the orphans, duplicates, gaps, unverifiable claims, and
reassessment notes found. A review record is evidence for the reader of the
change; it is optional, it is not authority, and acceptance is never recorded
in it. Existing records are history.

## Moves and identity

The `requirement` identity must equal the file's path under `specifications/`.
Moving a file therefore changes its identity: a requirements decision, landed
as one coherent break with `catalog.md` regenerated in the same change and
shown in the verdict as a removal and an addition.

## Validate

```bash
pnpm exec nx run specifications:generate   # conformance + catalog.md
pnpm test:spec --requirement <id>          # evidence for one requirement
pnpm exec nx run axm:specification-verdict # per-change requirement diff
```
