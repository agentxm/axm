# Authoring specifications

Every `*.spec.ts` states one accepted requirement. Directories are physical
layout; requirement identity, intents, and class carry the taxonomy.

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

Library requirements go under `client-core/<concept>/`; repository, release,
and platform requirements under `system/<class>/`.

## Recurring invariant families

Idempotency, preview purity, and preserved-unowned-state recur per command.
Keep them in each command's folder with the shared names (`preview-is-pure`,
`*-is-idempotent`, `preserves-*`) and tag the matching intent. Cross-cutting
views come from intent metadata, never duplicate directories.

## Moves and identity

The `requirement` identity must equal the file's path under `specifications/`
(without `.spec.ts`). Moving a file therefore changes its identity: a
requirements decision needing maintainer review, landed as one coherent break
with `catalog.md` regenerated in the same change.
