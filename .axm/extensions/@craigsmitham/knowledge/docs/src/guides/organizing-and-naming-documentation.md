---
type: Guide
title: Organizing and naming documentation
description: How to choose a form-first or subject-first organization, colocate the documents that belong together, create descriptive paths and titles, and preserve discovery during change.
tags: [docs, organization, information-architecture, navigation, naming, filenames, folders, migration, discovery]
status: stable
sources:
  - id: organization
    resource: ../explainers/documentation-organization-and-discovery.md
    title: Documentation organization and discovery
  - id: documentation-craft-guide
    resource: documentation-craft.md
    title: Documentation craft guide
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T22:05:43Z
---

# Organizing and naming documentation

Use this guide when placing a new group of documents, restructuring a bounded
collection, or replacing terse and ambiguous names. For the reasoning behind
form-first and subject-first organization, read
[Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md).

## Goal

Create an organization whose primary browsing axis matches how readers enter
the collection, keeps strongly related documents adjacent, and leaves every
path and title understandable when directory context is absent.

## Preconditions

- A bounded collection or proposed set of documents
- Representative reader questions or observed retrieval behavior
- Knowledge of the host's path, URL, index, metadata, redirect, and validation
  rules
- Authority to add or rename the affected paths

If restructuring an existing corpus, keep the first change small enough to
validate independently. Use the [Documentation workflow
guide](documentation-workflow.md) rather than waiting for a complete site-wide
redesign.

## 1. Name the scope and reader entry point

State which collection you are organizing. Do not begin with the whole
repository when the actual problem concerns one section.

List the questions that bring readers into that scope. Classify the dominant
entry as:

- **form-first** — “I need a guide,” “Help me understand,” or “Which reusable
  pattern applies?”; or
- **subject-first** — “What governs payments?” or “How does deployment work?”

Do not infer the answer solely from the current folders. Use search terms,
support questions, common links, navigation behavior, or direct reader and
maintainer knowledge when available.

## 2. Map the relationships that need adjacency

For each document, record:

- its primary reader job;
- its subject and authority;
- its owner and review trigger;
- documents it depends on or must remain consistent with; and
- documents readers commonly need immediately before or after it.

Prefer adjacency for documents that share meaning, authority, and change over
documents that merely share a metadata value. This prevents a mechanically
tidy taxonomy from fragmenting the subject.

## 3. Choose the primary physical axis

Use the strongest evidence at this scope:[^organization]

| Choose | When |
| --- | --- |
| Form-first folders | Readers browse by help needed; same-form comparison and common authoring practice matter most |
| Subject-first folders | Readers browse by domain; cross-form documents share authority and change together |
| Side-by-side files | One subject has a small, cohesive set and another folder would add a decision without clarifying a boundary |
| A subject subfolder | The subject has enough internal structure to warrant its own index or browsing decision |

A hybrid is coherent when different scopes have explicit rules—for example, a
subject-first root with one bounded form-first collection. Do not alternate
axes unpredictably among siblings at the same scope.

When several adjacent concepts are repeatedly confused, do not expand their
index entries into a substantive comparison or make every concept repeat the
same matrix. Apply [Concept boundaries](../patterns/concept-boundaries.md): keep
each positive definition canonical, give the comparative relationship one
explicit document, and use the index only to route readers to both.

## 4. Make every folder earn its boundary

For each proposed directory, finish this sentence:

> This folder groups documents that ________, so a reader can ________.

Keep the folder when the answer identifies a real relationship and browsing
decision. Reconsider it when the answer is merely “have the same file type,”
“might exist later,” or “would otherwise have similar names.” Do not create
empty shelves for expected future content.

## 5. Give files stable, descriptive names

Derive each filename from the document's specific subject or action, not only
its form.

| Document job | Filename shape | Example |
| --- | --- | --- |
| Explain a concept | Distinctive subject-oriented noun phrase | `patterns-as-reusable-guidance.md` |
| Guide an action | Verb or outcome phrase | `documenting-patterns.md` |
| State reference facts | Named interface, object, or fact set | `payment-status-fields.md` |
| Record a named pattern | Stable pattern name | `runbook.md` |

Avoid generic leaf names such as `overview.md`, `guide.md`, or `concept.md`
unless their enclosing scope is guaranteed to remain present in every URL,
search result, tab, export, and citation. Avoid mechanical names such as
`pattern-guide.md` when `documenting-patterns.md` reveals the actual task.

Use stable domain language. Exclude temporary project phases, current team
names, and implementation details unless they define the document's enduring
scope.

## 6. Give titles standalone reader meaning

The title should remain clear in a flattened search result or backlink.

- Give explainers a subject or distinction: “Patterns as reusable guidance.”
- Give guides an action or outcome: “Documenting patterns.”
- Avoid identical display titles for paired documents unless their interface
  always supplies reliable context.
- Align title and filename closely enough that a reader can predict one from
  the other.

Folders and type metadata still contribute useful context, but neither should
carry the title's entire semantic burden.

## 7. Design the secondary discovery routes

Use one authoritative physical location and expose the secondary axis through:

- local and root indexes;
- type, subject, and lifecycle metadata;
- explicit links among paired or related documents;
- search-oriented titles, descriptions, and tags; and
- generated views when the host can derive them without copying content.

For every index entry, use the document's canonical title and a description
that distinguishes it from its neighbors. The general document-authoring
workflow still applies: match the content to its reader job before applying
host-specific paths and metadata.[^documentation-craft-guide]

## 8. Plan a rename or move as a migration

Before changing existing paths:

1. inventory inbound links, compact references, published URLs, and generated
   navigation that depend on them;
2. define old-to-new mappings;
3. choose redirects, aliases, deprecated stubs, or a coordinated breaking
   change according to host capabilities;
4. move the document and update its canonical title, description, indexes,
   metadata, and internal links together; and
5. avoid leaving two independently maintained copies.

Renaming a title alone is cheaper than changing a filename or concept ID. Use
that difference deliberately, but do not retain a misleading identifier when
its discovery cost exceeds a safe migration.

## 9. Validate from three contexts

Check the result as:

1. **A browser:** start at the collection root and follow indexes. Is the next
   choice obvious and is every concept reachable?
2. **A searcher:** flatten folder context. Do title, description, tags, and
   filename distinguish each result?
3. **A maintainer:** inspect raw paths and nearby documents. Are the organizing
   rule, authority, and expected change relationships evident?

Then run host link, metadata, and package validators. Fix orphaned documents,
stale links, ambiguous duplicates, and indexes whose descriptions no longer
match their targets.

## Final check

- The chosen axis matches the dominant reader entry point at this scope.
- Documents that share authority and change remain adjacent.
- Every folder expresses a real boundary and browsing decision.
- Every filename is stable and meaningful outside its directory.
- Every title communicates the document's specific reader job.
- Metadata and indexes expose useful secondary views without duplication.
- Recurring cross-concept distinctions have one authority outside indexes.
- Moves and renames preserve or deliberately migrate inbound references.
- Browse, search, and raw-path discovery all work.

## Related

- [Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md)
- [Documentation craft](../explainers/documentation-craft.md) · [Documentation craft guide](documentation-craft.md)
- [Documentation workflow](../explainers/documentation-workflow.md) · [Documentation workflow guide](documentation-workflow.md)
- [Documentation quality](../explainers/documentation-quality.md)
- [Concept boundaries](../patterns/concept-boundaries.md)

[^organization]: Documentation organization and discovery defines form-first
    and subject-first grouping and treats semantic adjacency as the deciding
    relationship.
[^documentation-craft-guide]: Documentation craft guide begins with the reader
    need and applies host paths, metadata, and validators after the document's
    job is clear.
