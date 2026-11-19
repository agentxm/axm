---
type: Pattern
title: Domain glossary
description: When a familiar word has a specialized meaning, give people and agents a shared place to look it up in context.
tags: [knowledge, terminology, glossary, ubiquitous language, bounded context, generated glossary]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:40:27Z" }
sources:
  - id: fowler
    resource: https://martinfowler.com/bliki/GeneratedGlossary.html
    title: Generated Glossary
  - id: extension-glossary
    resource: /glossary.md
    title: Agent Extension Glossary
---

# Domain glossary

A team may use a familiar word precisely enough that nobody thinks to explain
it. An agent can then write a plausible guide using a different meaning. Give
people and agents a glossary they can consult when that difference changes a
decision. A short definition, the context where it applies, and an example of
its use can be enough.

A glossary helps a team develop its ubiquitous language. When two groups use
the same term differently, record each meaning with its bounded context. If
people working in the _same_ context disagree, show them examples of the
conflicting uses so they can decide what the term should mean.[^fowler]

## Choose how to maintain an entry

- **LLM-drafted.** Ask a model to find distinctive terms and familiar words
  used in unfamiliar ways across documents, code, or conversations. Have it
  show a usage example for each proposed meaning. A domain practitioner can
  then confirm the distinction, correct it, or leave the question open. Revisit
  the evidence when usage changes.[^fowler]
- **Computationally derived.** When a schema or another structured source
  already defines the terms, generate entries from its names and descriptions.
  Link back to that source and regenerate when it changes. A field name alone
  gives you a candidate term. Its meaning still needs an author.
- **Hand-authored.** When practitioners choose a term together, write down the
  agreed meaning and an example while the decision is fresh. A small, stable
  vocabulary may need only a few entries maintained this way.

These methods can coexist. A model might surface two uses of a field name, a
schema might define its API meaning, and a domain expert might write the entry
for its use in conversation. Give each meaning one authoritative home so a
correction reaches everyone who relies on it.

## Put the glossary where the decision happens

Suppose an author is asked whether an “open agent” can use a proprietary model.
The [open agent entry](../glossary.md#open-agent) directs the author to examine
how third parties can extend the agent. The model's license alone cannot settle
that question.[^extension-glossary] Link the author to the entry wherever that
choice arises. For a large vocabulary, a searchable list of terms with links
lets the agent retrieve just the definition it needs. See [Progressive
disclosure](progressive-disclosure.md).

Try a real naming or writing decision with the entry. If a reader still needs
to ask which meaning applies, add the distinguishing context or a better
example. If a word occurs in only one procedure and a sentence there settles
the question, explain it at that step. A separate entry adds another lookup
and another definition to maintain.

[^fowler]: Martin Fowler, [Generated Glossary](https://martinfowler.com/bliki/GeneratedGlossary.html).

[^extension-glossary]: Agent Extension Glossary, “Open agent.”
