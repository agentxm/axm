---
type: Pattern
title: Domain glossary
description: When several workflows depend on local terminology, give them a glossary concept they can consult where the meaning affects a decision.
tags: [knowledge, terminology, glossary, ubiquitous language, bounded context, generated glossary]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:52:30Z" }
sources:
  - id: fowler
    resource: https://martinfowler.com/bliki/GeneratedGlossary.html
    title: Generated Glossary
  - id: extension-glossary
    resource: /glossary.md
    title: Agent Extension Glossary
---

# Domain glossary

Suppose a fulfillment team uses “release” for handing a packed order to its carrier.
A software team in the same organization uses it for publishing a version.
When agents write customer updates and release notes, both meanings matter.
A glossary can make the team's ubiquitous language available to both workflows.
Give each meaning its bounded context. Where people in the same context
disagree, bring the conflicting examples to them for a decision.[^fowler]

## Give the vocabulary a home

For the fulfillment team, add a reference concept such as `glossary.md` to
its domain knowledge bundle and link it from the bundle index. The entry for
“Release (fulfillment)” might say that a packed order reaches release when
the carrier takes possession. Printing the label leaves it awaiting release.
A reader can now look up the term directly. For a large vocabulary, an index
of terms can point to separate concepts by context.

If the team has a customer-update skill, put the retrieval cue at the writing
decision in its `SKILL.md`. For example, “When translating an order status
into customer-facing language, consult the fulfillment glossary.” Give the
skill a packed order with a printed label and no carrier handoff. Its draft
should say the order is packed and awaiting pickup. The release-note skill can consult the software
team’s vocabulary. If users only need direct lookup, the knowledge bundle
alone provides it. If a word matters at just one step of one skill, explain
it there. [Progressive disclosure](progressive-disclosure.md) covers those
placement choices.

This pack uses the same arrangement. “Can an open agent use a proprietary
model?” follows AXE’s term-lookup cue to the [open agent entry](../glossary.md#open-agent).
A reader can retrieve that same concept directly in AXM.

```sh
axm knowledge concepts get '@agentxm/knowledge/axe#glossary'
```

The entry lets the reader answer yes and explain which extension interfaces
matter.[^extension-glossary] “How should our agents use our fulfillment
vocabulary?” reaches this pattern instead. Try both questions when checking
a routing skill that offers both jobs.

## Choose how to maintain an entry

- **LLM-drafted.** Ask a model to find distinctive terms and familiar words
  used in unfamiliar ways across documents, code, or conversations. Have it
  show a usage example for each proposed meaning. A domain practitioner can
  then confirm the distinction, correct it, or leave the question open. Revisit
  the evidence when usage changes.[^fowler] A recurring drafting task can
  live in a maintenance skill that proposes edits for review.
- **Computationally derived.** When a schema or another structured source
  already defines the terms, let the bundle’s build generate entries from its
  names and descriptions, with links back to their source. A field name alone
  gives you a candidate term. Its meaning still needs an author.
- **Hand-authored.** When practitioners choose a term together, write down the
  agreed meaning and an example directly in the concept. A small, stable
  vocabulary may need only a few entries maintained this way.

These methods can coexist. A model might surface two uses of a field name, a
schema might define its API meaning, and a domain expert might write the entry
for its use in conversation. Give each meaning one authoritative home so a
correction reaches everyone who relies on it.

[^fowler]: Martin Fowler, [Generated Glossary](https://martinfowler.com/bliki/GeneratedGlossary.html).

[^extension-glossary]: Agent Extension Glossary, “Open agent.”
