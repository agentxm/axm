---
type: Guide
title: Organizing and naming documentation
description: Use when placing a new document collection, restructuring a bounded corpus, or replacing ambiguous names; choose a coherent organizing axis and preserve discovery during change.
tags: [docs, organization, information-architecture, navigation, naming, filenames, folders, migration, discovery]
status: stable
sources:
  - id: organization
    resource: ../explainers/documentation-organization-and-discovery.md
    title: Documentation organization and discovery
  - id: documentation-craft
    resource: ../explainers/documentation-craft.md
    title: Documentation craft
generated: { by: codex/gpt-6, at: 2026-11-22T02:02:34Z }
---

# Organizing and naming documentation

Begin with the pages you can organize and a question readers bring to
them. Suppose musicians looking for a room keep opening the venue’s
booking policy when they need the reservation steps. Both pages appear
in search as “Rehearsal rooms.” Look at the results and the route from
the venue index before deciding what needs to move.

## 1. Name the scope and reader entry point

State which collection you are organizing. Do not begin with the whole
repository when the actual problem concerns one section.

List the questions that bring readers into that scope. Classify the dominant
entry as:

- **form-first** — “I need a guide,” “Help me understand,” or “Which procedure applies?”; or
- **subject-first** — “What governs payments?” or “How does deployment work?”

Do not infer the answer solely from the current folders. Use search terms,
support questions, common links, navigation behavior, or direct reader and
maintainer knowledge when available. If the evidence is thin, sketch the
plausible routes and try the same reader question in each before moving
pages.

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

## 3. Choose how readers will browse this collection

Use the strongest evidence at this scope:[^organization]

| Choose | When |
| --- | --- |
| Form-first folders | Readers browse by help needed; same-form comparison and common authoring practice matter most |
| Subject-first folders | Readers browse by domain; cross-form documents share authority and change together |
| Side-by-side files | One subject has a small, cohesive set and another folder would add a decision without clarifying a boundary |
| A subject subfolder | The subject has enough internal structure to warrant its own index or browsing decision |

For the venue, musicians first choose rehearsal rooms and then either
check a policy or book a room. Give both pages a place under that subject.
If the existing index already groups them there, try distinguishing their
titles in search before proposing a directory change.

A hybrid is coherent when different scopes have explicit rules—for example, a
subject-first root with one bounded form-first collection. Do not alternate
axes unpredictably among siblings at the same scope.

When several adjacent concepts are repeatedly confused, do not expand their
index entries into a substantive comparison or make every concept repeat the
same matrix. Apply [Comparing concepts](comparing-concepts.md): keep
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

If the host assigns permanent page IDs, use the titles and navigation
labels in the next steps to distinguish the pages. Where you can choose
a filename or URL slug, derive it from the document’s specific subject
or action. Here are examples for a Markdown collection.

| Document job | Filename shape | Example |
| --- | --- | --- |
| Explain a concept | Distinctive subject-oriented noun phrase | `transaction-isolation.md` |
| Guide an action | Verb or outcome phrase | `booking-a-rehearsal-room.md` |
| State reference facts | Name of the item or facts readers look up | `instrument-loan-periods.md` |
| Document an operational procedure | Task-specific name | `rotate-service-credentials.md` |

Avoid generic leaf names such as `overview.md`, `guide.md`, or `concept.md`
unless their enclosing scope is guaranteed to remain present in every URL,
search result, tab, export, and citation. Avoid mechanical names such as
`booking-guide.md` when `booking-a-rehearsal-room.md` reveals the actual task.

Use stable domain language. Exclude temporary project phases, current team
names, and implementation details unless they define the document's enduring
scope.

## 6. Give titles standalone reader meaning

The title should remain clear in a flattened search result or backlink.

- Give explainers a subject or distinction: “Transaction isolation.”
- Give guides an action or outcome: “Booking a rehearsal room.”
- Avoid identical display titles for paired documents unless their interface
  always supplies reliable context.
- Align title and filename closely enough that a reader can predict one from
  the other.

Folders and type metadata still contribute useful context, but neither should
carry the title's entire semantic burden.

## 7. Design the secondary discovery routes

Keep one maintained copy of each page. Readers can reach it through:

- local and root indexes;
- type, subject, and lifecycle metadata;
- explicit links among paired or related documents;
- search-oriented titles, descriptions, and tags; and
- generated views when the host can derive them without copying content.

For every index entry, use the document's canonical title and a description
that distinguishes it from its neighbors. For an action-oriented document,
that description should expose both the supported outcome and the situation,
event, symptom, or reader intent that makes it relevant. Do not mistake access,
knowledge, or state preconditions for the reason a reader should select it.
The general document-authoring workflow still applies: match the content to
its reader job before applying host-specific paths and
metadata.[^documentation-craft]

## 8. Plan a rename or move as a migration

Before changing existing paths:

1. inventory inbound links, compact references, published URLs, and generated
   navigation that depend on them;
2. define old-to-new mappings;
3. choose redirects, aliases, deprecated stubs, or a coordinated breaking
   change according to host capabilities;
4. identify the title, description, indexes, metadata, and internal links that
   must change with the document.

For a proposal, give the suggested paths or title changes, the reader
question each resolves, and the old links each move would affect. Walk
the proposed routes in the draft and stop with that mapping. For an authorized
migration, check the host’s path, redirect, index, and metadata rules.
Move a group small enough to check together, update its references, and
retire the old copy using the host's migration policy.

Renaming a title alone is cheaper than changing a filename or concept ID. Use
that difference deliberately, but do not retain a misleading identifier when
its discovery cost exceeds a safe migration.

## 9. Validate from three contexts

Check the result as:

1. **A browser:** start at the collection root and follow indexes. Is the next
   choice obvious and is every concept reachable?
2. **A searcher:** flatten folder context. Do title, description, tags, and
   filename distinguish each result, and can a reader tell when to choose an
   action document before opening it?
3. **A maintainer:** inspect raw paths and nearby documents. Are the organizing
   rule, authority, and expected change relationships evident?

For the venue, search for “rehearsal room” again. Can you pick the
reservation steps from the result titles and reach the same page from
the venue index? Open an existing booking link too. If it breaks, repair
the old route or carry out the agreed migration before closing the
change. Run the host’s link, metadata, and package checks where available
and fix any orphaned pages or stale previews they uncover.

## Related

- [Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md)
- [Documentation craft](../explainers/documentation-craft.md)
- [Documentation workflow](../explainers/documentation-workflow.md)
- [Documentation quality](../explainers/documentation-quality.md)
- [Comparing concepts](comparing-concepts.md)

[^organization]: Documentation organization and discovery defines form-first
    and subject-first grouping and treats semantic adjacency as the deciding
    relationship.
[^documentation-craft]: [Documentation craft](../explainers/documentation-craft.md).
