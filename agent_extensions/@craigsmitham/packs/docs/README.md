# Documentation craft

Portable guidance for **effective documentation**: how to understand, author,
organize, audit, and improve it without displacing repository-local authority.

Inspired by [Diátaxis](https://diataxis.fr/), this pack organizes guidance as
**explainers**, **guides**, and reusable guidance such as **principles** and
**patterns**. The four reader needs — tutorial, how-to, explanation, and
reference — remain foundational without becoming the bundle's directory
taxonomy. It does **not** prescribe host folder trees,
frontmatter schemas, validators, or tooling. Local projects keep their own
implementation details.

## Included extensions

Members are **not standalone** (`standalone: false`): install this pack rather
than treating the leaves as complete units on their own.

| Extension                          | Role                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@craigsmitham/knowledge/docs`     | Explainers for understanding, guides for action, principles for judgment, and patterns for recurring problems |
| `@craigsmitham/skills/author-docs` | Create, organize, review, and remediate docs by loading only the relevant craft concepts                      |
| `@craigsmitham/skills/audit-docs`  | Assess a bounded documentation corpus and return evidence-backed findings without silently remediating it     |

## Install

```bash
axm packs install @craigsmitham/packs/docs
```

## Usage

- **Author:** ask to create or revise a guide, tutorial, reference, explanation,
  README, or other repository documentation.
- **Review and remediate:** ask to review one identified document, refresh
  stale content, repair links, or restructure a bounded collection.
- **Audit:** ask for a read-only assessment of a documentation corpus before
  deciding what to remediate.
- **Reusable guidance:** ask to create or review a principle, pattern, pattern
  library, playbook, or runbook.
- **Doctrine:** search or open concepts under the `docs` knowledge bundle (via
  `axm knowledge concepts search` / `axm knowledge concepts get`).

Prefer any repository documentation guidelines when they exist; this pack is
the quality bar, not a layout standard.

## License

The pack's own metadata and README are licensed under CC-BY-SA-4.0. Each member
retains the license declared in its manifest. See the repository for source
attribution and provenance.
