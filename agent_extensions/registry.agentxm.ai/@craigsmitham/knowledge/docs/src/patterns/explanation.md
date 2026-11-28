---
type: Pattern
title: Explanation
description: When readers need to reason about a subject, connect concepts, consequential distinctions, and examples into a bounded account that develops understanding.
tags:
- docs
- explanation
- understanding
- conceptual-structure
- distinctions
- judgment
- examples
- evidence
- diataxis
- documentation-pattern
- pattern
- authoring
status: draft
sources:
- id: diataxis-explanation
  resource: https://diataxis.fr/explanation/
  title: Diátaxis — Explanation
- id: diataxis-ref-explanation
  resource: https://diataxis.fr/reference-explanation/
  title: Diátaxis — Reference vs explanation
- id: ddd-authoring
  resource: https://github.com/craigsmitham/agent-extensions/blob/bfb5fc84821605a8fc1996d85ca7c5fbebfc1a3f/knowledge/product-engineering/src/foundations/domain-driven-design.md
  title: Domain-driven design — repository authoring case
- id: jtbd-authoring
  resource: https://github.com/craigsmitham/agent-extensions/blob/bfb5fc84821605a8fc1996d85ca7c5fbebfc1a3f/knowledge/product-engineering/src/foundations/jobs-to-be-done.md
  title: Jobs to Be Done — repository authoring case
- id: sqlite-isolation
  resource: https://www.sqlite.org/isolation.html
  title: SQLite — Isolation in SQLite
generated: { by: codex/gpt-6, at: 2026-11-22T02:10:28Z }
---

# Explanation

Choose an explainer when knowing the steps or the facts still leaves a reader
unable to account for what happens. The design gives them a connected account
they can use to interpret another case. It also fits an introduction where
several ideas make sense only in relation to one another.[^diataxis-explanation]

## When the distinction matters

Consider SQLite's account of isolation. Someone who wants the spelling of
a journal-mode setting can look it up. Someone puzzled by an old value
after a writer commits needs to know which version the reader can see.
SQLite follows two database connections in write-ahead logging mode.
The reader keeps the snapshot it was already reading. When it ends that
transaction and starts a new one, the committed change becomes visible.[^sqlite-isolation]
A page that lists each setting accurately could still leave this question
unanswered.

The reader’s use decides the form. A table comparing how two authors use a
term can carry an explanation. A table of accepted values serves as
[reference](reference.md).[^diataxis-ref-explanation] Directions for
configuring a database for a particular workload belong in a
[how-to guide](how-to.md). A [principle document](principle.md) can build
on an explanation when a team also needs warranted direction for a
recurring decision.

## Costs and limits

An explainer gives the author room to choose a viewpoint. The choice has
consequences. A tidy classification may hide a real disagreement. A broad
overview may introduce so many concepts that the original question gets
lost. Look for the condition under which an account changes, the evidence
that supports it, and a case the reader can now interpret.

Two earlier documents in this repository illustrate different uses. The
domain-driven design introduction distinguishes a business subdomain from
the boundary of a particular model. The Jobs to Be Done introduction uses
one service incident to examine both the progress a manager seeks and the
work responders must coordinate. These are examples of explanatory choices.
Whether their readers gained understanding would require evidence from
those readers.[^ddd-authoring][^jtbd-authoring]

For the role of reflection and evidence in this form, read
[How explainers build understanding](../explainers/explanation.md).
To develop a reader’s question into a draft, follow
[How to write an explainer](../guides/writing-an-explainer.md).

[^diataxis-explanation]: Daniele Procida, [Explanation](https://diataxis.fr/explanation/).
[^diataxis-ref-explanation]: Daniele Procida, [The difference between reference and explanation](https://diataxis.fr/reference-explanation/).
[^sqlite-isolation]: SQLite, [Isolation in SQLite](https://www.sqlite.org/isolation.html).
[^ddd-authoring]: [Domain-driven design, historical authoring case](https://github.com/craigsmitham/agent-extensions/blob/bfb5fc84821605a8fc1996d85ca7c5fbebfc1a3f/knowledge/product-engineering/src/foundations/domain-driven-design.md).
[^jtbd-authoring]: [Jobs to Be Done, historical authoring case](https://github.com/craigsmitham/agent-extensions/blob/bfb5fc84821605a8fc1996d85ca7c5fbebfc1a3f/knowledge/product-engineering/src/foundations/jobs-to-be-done.md).
