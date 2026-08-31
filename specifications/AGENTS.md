# Authoring specifications

Every `*.spec.ts` states one accepted requirement. Directories are physical
layout; requirement identity, product goals, class, and role carry the
taxonomy.

Use the installed `engineer-requirements` skill for elicitation, review,
impact analysis, and requirement changes. This repository maps each normative
requirement to one `*.spec.ts`; code, tests, issues, and documentation are
evidence or witnesses unless this file says otherwise. Maintainer review is
the acceptance authority.

## Placement

The tree under `cli/` mirrors the registered CLI command tree. Place a spec at
the command node it is about; if it quantifies over several commands, place it
at their nearest common ancestor (whole-surface and workspace-state invariants
sit directly in `cli/`). Folders exist only for commands that exist: every
directory path under `cli/` must name a registered command path
(`system/architecture/specification-folders-mirror-command-tree` enforces
this).

Library requirements go under a top-level product concept area
(`extension-identity/`, `package-identity/`, `settings-contract/`,
`source-resolution/`, `version-constraints/`); repository, release,
and platform requirements under `system/<class>/`.

## Requirement roles

Give every requirement one primary role:

- `experience` — behavior meaningful to a person or agent completing an AXM
  task;
- `interface` — a public machine-consumable contract; or
- `supporting` — a subordinate system or engineering obligation.

Split independently promised experience and interface behavior into separate
requirements. Keep non-normative implementation detail in internal tests.

## Recurring invariant families

Idempotency, preview purity, and preserved-unowned-state recur per command.
Keep them in each command's folder with the shared names (`preview-is-pure`,
`*-is-idempotent`, `preserves-*`) and tag the matching product goal.
Cross-cutting views come from goal metadata, never duplicate directories.

## Bound evidence

A specification whose decisive verification is a static gate (for example the
Nx module-boundary or manifest-fidelity lint) declares literal-only
`boundEvidence` beside its `specification` constant with `defineBoundEvidence`
from `support/contract.ts`. Bound evidence supports the owning specification
and never replaces it: the specification file remains the requirement's sole
authority, and the catalog reads the declaration statically.

## Moves and identity

The `requirement` identity must equal the file's path under `specifications/`
(without `.spec.ts`). Moving a file therefore changes its identity: a
requirements decision needing maintainer review, landed as one coherent break
with `catalog.md` regenerated in the same change.
