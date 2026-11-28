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
generated: { by: codex/gpt-6, at: 2026-11-22T01:48:07Z }
---

# Documentation organization and discovery

Where will readers look first for the document they need? Grouping pages
by subject helps someone who knows which product they use. Grouping them
by document form helps someone looking for a tutorial or a reference.
A directory tree makes one of those routes easier to follow, so the
choice depends on what readers usually know when they arrive.

## Which pages does the reader need together?

Suppose a payments analyst wants to reconcile yesterday’s settlement.
They already know the subject, and they may need both the reconciliation
guide and the explanation of why some transactions appear a day later.
Under `payments/`, they can move between the two. If a settlement rule
changes, the maintainer can also see which directions depend on it.
This is the case for **subject-first** grouping.[^documentation-craft]

Now consider an instructor comparing tutorials for several products.
A tutorials index puts the documents they want side by side. In a
collection about writing documentation, readers may arrive already
knowing they want a guide or a pattern. Starting with the form saves
them a separate search under each subject. This is the case for
**form-first** grouping. It would cost the payments analyst a second
trip through the tree.

What deserves a place together depends on the relationship that readers
or maintainers need to see. This is sometimes called *semantic adjacency*.
For the analyst it is the connection between a rule and the procedure
that applies it. For the instructor it is the opportunity to compare how
different tutorials teach a first skill.

Different scopes may choose different axes coherently. A bundle may be
subject-first at its root while one bounded collection inside it is
form-first. What matters is the question each level lets the reader answer.
A folder labeled “Payments” narrows the subject. An empty “Tutorials”
folder within it offers a choice that leads nowhere. As material grows,
the relationships between actual pages can earn a new branch.[^documentation-workflow]

## One directory tree, several discovery views

A knowledge-base search or a bot may take someone straight to a page. Its
title and opening lines then do the orienting work that a directory or
navigation menu would otherwise do.

- **Directories** express collection-level boundaries and the primary browsing
  axis.
- **Filenames** provide durable path identity and must remain intelligible in
  URLs, editor tabs, command output, and raw links.
- **Titles** tell readers what the individual document will help them
  understand or do.
- **Metadata** carries secondary facets such as form, subject, lifecycle, and
  search vocabulary without forcing each into the path. A description is also
  a routing preview: for action-oriented concepts, it should pair the outcome
  with the selection condition that distinguishes when the concept applies.
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

Name the distinction readers are looking for. In a rehearsal collection,
`repeat-signs.md` can be specific enough for a lookup entry.
`following-first-and-second-endings.md` names the task a singer might need
help with. A suffix such as `-guide` alone would tell them little about
which page to open.

Filename and title should remain recognizably aligned without being forced into
identical grammar. Prefer stable domain language over current team names,
project phases, or incidental tooling. Descriptive does not mean exhaustive: a
filename should distinguish the document, not summarize every section.

## What changes when a page moves

Suppose the settlement guide already has a URL in the analyst’s month-end
notes. Giving it a home next to the explanation helps the next person
browsing Payments, yet a move that breaks the existing URL costs the
analyst their quickest way in. A local index may be enough to put the
two documents together for readers while keeping both addresses. If the
documents do need to move, the host’s support for redirects or retained
links determines which old routes can survive. The practical choices
are covered in [Organizing and naming documentation](../guides/organizing-and-naming-documentation.md).

## Related

- [Documentation audits](documentation-audits.md) · [Documentation audit report contract](../guides/auditing-documentation.md)
- [Organizing and naming documentation](../guides/organizing-and-naming-documentation.md)
- [Documentation craft](documentation-craft.md)
- [Documentation workflow](documentation-workflow.md)
- [Documentation quality](documentation-quality.md)

[^documentation-craft]: Documentation craft distinguishes the reader job of a
    document from the form of reusable guidance and requires each job to remain
    recognizable without prescribing host layout.
[^documentation-workflow]: Documentation workflow favors small, complete
    improvements and lets organization emerge from real material rather than
    empty top-down form shells.
