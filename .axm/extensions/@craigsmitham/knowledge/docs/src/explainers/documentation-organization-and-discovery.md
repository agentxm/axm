---
type: Explainer
title: Documentation organization and discovery
description: Why documentation organization should follow reader entry points and semantic relationships, when to prefer form-first or subject-first grouping, and how paths, titles, metadata, and indexes work together.
tags: [docs, organization, discovery, information-architecture, navigation, naming, filenames, folders, colocation]
status: stable
sources:
  - id: documentation-craft
    resource: documentation-craft.md
    title: Documentation craft
  - id: documentation-workflow
    resource: documentation-workflow.md
    title: Documentation workflow
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T17:08:26Z
---

# Documentation organization and discovery

Documentation organization is a claim about which relationships readers and
maintainers should see first. A directory tree makes one route inexpensive and
other routes indirect, so its primary axis should reflect the collection's
dominant retrieval question rather than an abstract universal taxonomy.

This is portable reasoning for choosing an organization, not a prescribed
repository layout. Host conventions, publication systems, URLs, and migration
constraints remain authoritative. The relevant craft obligation is to match
form to reader need and keep each document's job recognizable wherever it is
encountered.[^documentation-craft]

For a practical decision and migration process, see
[Organizing and naming documentation](../guides/organizing-and-naming-documentation.md).

## A tree privileges one primary question

Two questions commonly compete:

- **Form-first:** What kind of help do I need — understanding, action, or a
  reusable solution?
- **Subject-first:** What do I need help with — billing, architecture,
  deployment, or another domain concern?

A physical tree cannot make both axes primary at the same scope without either
duplicating documents or producing an inconsistent mixture. Choose the stronger
axis for that scope and expose the other through titles, metadata, links,
indexes, and search.

Different scopes may choose different axes coherently. A bundle may be
subject-first at its root while one bounded collection inside it is form-first.
The requirement is not uniformity everywhere; it is a legible rule at each
level.

## When form-first grouping fits

Folders such as `explainers/`, `guides/`, and `patterns/` fit when:

- readers deliberately browse by the kind of guidance they need;
- comparing documents of the same form across subjects is useful;
- the collection teaches or governs those forms;
- documents of one form share authoring or review practices;
- subjects regularly receive parallel treatment in several forms; and
- the form vocabulary is more stable than the subjects.

A documentation-craft collection is naturally form-first because explaining
and applying documentation forms are central reader concerns. The organization
also makes the difference between understanding, action, and reusable solutions
visible at a glance.

Form-first grouping becomes costly when readers normally enter through a domain
subject. It can scatter one concept's explanation, procedure, reference, and
decisions across distant branches and conceal their shared authority.

## When subject-first colocation fits

Keeping different forms side by side under a domain section fits when:

- readers enter through the subject rather than the documentation form;
- the documents share sources, ownership, authority, and review triggers;
- understanding and action form a close pair;
- those documents change together more often than documents of one form do;
- the subject has a small, cohesive cluster of documents; and
- the domain taxonomy is more durable than the set of documentation forms.

For example, an explainer of settlement rules and a guide to reconciling a
settlement may belong together under `payments/`. Separating them into global
`explainers/` and `guides/` branches would make their formal similarity more
visible but their domain relationship less visible.

Subject-first organization does not erase form. Type metadata, standalone
titles, descriptive filenames, and local index annotations should still tell a
reader what job each document performs.

## Choose semantic adjacency

The strongest organizing evidence is **semantic adjacency**: which documents
must remain near one another for readers to understand the subject correctly
and for maintainers to keep it coherent.

Useful signals include:

| Signal | Favors form-first | Favors subject-first |
| --- | --- | --- |
| Reader enters by asking | “Show me how to…” or “Help me understand…” | “Show me everything about this subject” |
| Documents compared together | Same-form examples across subjects | Different forms about one subject |
| Shared authority | Documentation-form owner | Domain or system owner |
| Change coupling | Form guidance evolves together | Subject documents evolve together |
| More stable vocabulary | Guidance forms | Domain boundaries |
| Cost of separation | Inconsistent form craft | Fragmented subject understanding |

No numerical score decides the answer. The table makes the competing
relationships discussable and exposes when a proposed folder scheme serves
authors or tooling more than readers.

## One physical tree, several discovery views

Physical placement is only one discovery mechanism:

- **Directories** express collection-level boundaries and the primary browsing
  axis.
- **Filenames** provide durable path identity and must remain intelligible in
  URLs, editor tabs, command output, and raw links.
- **Titles** tell readers what the individual document will help them
  understand or do.
- **Metadata** carries secondary facets such as form, subject, lifecycle, and
  search vocabulary without forcing each into the path.
- **Indexes** author alternate routes and make important relationships
  explicit.
- **Search** flattens directory context, making standalone titles,
  descriptions, and filenames essential.

Do not force the directory tree to encode every useful classification. A
subject-first collection can publish a “Browse all guides” index; a form-first
collection can connect each subject's explainer and guide. Alternate views
should point to one authoritative document rather than duplicate its content.

## Names must survive lost context

A name is descriptive enough when a reader can distinguish the document after
its folder, metadata, or neighboring entries disappear.

The three naming surfaces have related but different jobs:

| Surface | Job | Example |
| --- | --- | --- |
| Directory | Name the meaningful collection boundary | `explainers/` or `payments/` |
| Filename | Supply a stable, distinctive concept or task identifier | `documenting-principles.md` |
| Title | State the reader-facing subject or action naturally | “Documenting principles” |

For explainers, use a subject-oriented noun phrase that exposes the important
distinction: `principles-as-normative-guidance.md`, not merely `principle.md` or
`principle-explainer.md`. For guides, name the action or outcome:
`documenting-principles.md`, not `principle-guide.md`. A suffix identifies form
but often conceals purpose.

Filename and title should remain recognizably aligned without being forced into
identical grammar. Prefer stable domain language over current team names,
project phases, or incidental tooling. Descriptive does not mean exhaustive: a
filename should distinguish the document, not summarize every section.

## A folder must earn its existence

A folder is warranted when it establishes a meaningful boundary, shortens a
real browsing decision, or supports a coherent local index. It is not warranted
merely because:

- two filenames would otherwise be similar;
- a taxonomy offers an unused category;
- a template expects every form to have a shelf; or
- an arbitrary document count has been reached.

Empty form shells make an information architecture look complete while serving
no reader. Documentation structure should consolidate as real material and
relationships emerge, not precede them as a top-down inventory of hoped-for
content.[^documentation-workflow]

## Organization is maintained, not finished

Placement and names should be stable enough to support links, but not protected
after they cease to represent the knowledge. When relationships change:

1. reassess the dominant reader entry point and semantic adjacency;
2. change the smallest scope whose organizing rule is no longer truthful;
3. preserve or migrate inbound references according to host capabilities;
4. update indexes, metadata, and links as one change; and
5. verify both browsing and context-free discovery.

Renaming is more consequential than retitling because filenames often become
URLs, concept identifiers, or external references. That cost argues for
deliberate stable names, not for preserving terse or misleading identifiers
indefinitely.

## Related

- [Documentation audits](documentation-audits.md) · [Auditing documentation](../guides/auditing-documentation.md)
- [Organizing and naming documentation](../guides/organizing-and-naming-documentation.md)
- [Documentation craft](documentation-craft.md) · [Documentation craft guide](../guides/documentation-craft.md)
- [Documentation workflow](documentation-workflow.md) · [Documentation workflow guide](../guides/documentation-workflow.md)
- [Documentation quality](documentation-quality.md)

[^documentation-craft]: Documentation craft distinguishes the reader job of a
    document from the form of reusable guidance and requires each job to remain
    recognizable without prescribing host layout.
[^documentation-workflow]: Documentation workflow favors small, complete
    improvements and lets organization emerge from real material rather than
    empty top-down form shells.
