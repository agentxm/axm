---
type: Agent Instructions
status: stable
description: Local profile and deliberate deviations for the OKF bundle under `docs/`.
---

# AXM documentation bundle

`docs/` is one OKF v0.2 bundle. The `author-okf` skill owns the format —
conformance, field semantics, type discipline, reserved-file structure, index
craft, and validation — and the [repository instructions](../AGENTS.md) own
command policy, review expectations, and the architecture reading rule. This file
adds only what is specific to this bundle: its scope, its type vocabulary, its
field profile, and the points where it departs from the skill.

## Scope

- Applies to every `.md` file under `docs/`, including this one.
- The bundle root is `docs/`, and `docs/index.md` carries `okf_version: "0.2"`.
- Does **not** apply to `contributing/guides/`, `README.md`, `CONTRIBUTING.md`,
  `CHANGELOG.md`, or acquired Knowledge bundles under `agent_extensions/**`. Each follows
  the contract of its actual consumer.
- Published site content lives in `packages/core/site-content/docs/` and belongs
  to the website, not this bundle. Do not symlink it in: the validator resolves
  symlinks, so a target outside `docs/` makes the bundle unvalidatable.
- Keep private AgentXM context out of this bundle. It ships in the public
  repository.

## Verify

```bash
python3 .claude/skills/author-okf/scripts/validate_okf.py docs
```

Errors mean the bundle is broken; fix them. The `index-description-mismatch`
warnings and the `index-entry` and `recommended-field` info findings are standing
state that follows from the [deviations](#deviations) below.

## Type vocabulary

This table is where the bundle's vocabulary lives, so a new value is added here
in the same change that introduces it.

| Type                 | Applies to                                                                      |
| -------------------- | ------------------------------------------------------------------------------- |
| `Architecture`       | `architecture/` — accepted product responsibilities, boundaries, and invariants |
| `Guide`              | repeatable repository procedures                                                |
| `Agent Instructions` | scoped instruction files that live inside the bundle                            |

## Field profile

Every document carries `type`, `status`, and `description`; OKF requires only the
first, and this bundle requires all three.

`status` here describes adoption, not implementation conformance: `stable` is
adopted and safe to rely on, `draft` marks a maintained document under review,
and a deprecated document names and links its successor when one exists.

`depends-on` is a local extension rather than an OKF field. It lists the direct
semantic dependencies whose material change requires reconsidering this document
— not a related-links list, a reading order, or a code dependency. Omit it rather
than writing `[]`. `stale_after` is optional and used as OKF specifies.

No other field belongs here, including the legacy `version`, `last-reviewed`, and
`date`. Remove out-of-profile fields when materially revising a document.

## Deviations

Four departures from `author-okf`, in force for this bundle:

- **Relative links, not bundle-relative.** The skill prefers `/`-prefixed paths.
  These documents are read directly in GitHub and editors, where
  `/architecture/...` resolves to the repository root and breaks, so write
  `../workspace/lockfile.md`.
- **No `log.md`.** The skill's maintenance workflow appends a dated log entry.
  Git and `CHANGELOG.md` own history here; do not create one.
- **Index annotations may shorten a description.** The skill copies the
  `description` into the index entry verbatim. Here an annotation may faithfully
  shorten it when that routes a reader better, and entries use `-` bullets with
  an em-dash annotation rather than the skill's `* [Title](url) - description`.
- **`title`, `tags`, and `resource` stay out**, though the skill recommends them.
  The H1 owns the title, and nothing in this repository reads the other two.
  Provenance fields (`sources`, `generated`, `verified`) are likewise unused, so
  no document should claim them.

## Local file conventions

- **`overview.md` explains the whole.** It gives readers a mental model,
  responsibilities and non-responsibilities, and the relationships among its
  siblings.
- **`glossary.md` defines local language.** Keep it to terms AXM itself owns; for
  shared product language, link the public AgentXM Knowledge bundle instead of
  redefining it.

## Before Working Here

- Write prose only for meaning that cannot be recovered reliably from code,
  tests, schemas, or generated contracts. Feature symmetry does not justify a
  document.
- Before adding or editing a document, use the `author-okf` skill. For prose
  craft, add `author-docs`, or `author-architecture-docs` under
  `docs/architecture/`.
- Run `pnpm run format`, then the validator, before finishing.
