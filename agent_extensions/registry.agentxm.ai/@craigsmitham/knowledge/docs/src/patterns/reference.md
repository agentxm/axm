---
type: Pattern
title: Reference
description: When readers need authoritative facts during work, organize accurate, consistently structured entries around the subject so they can locate and compare details quickly.
tags:
- docs
- reference
- diataxis
- explanation
- documentation-pattern
- pattern
- authoring
status: draft
sources:
- id: diataxis-reference
  resource: https://diataxis.fr/reference/
  title: Diátaxis — Reference
- id: python-logging-reference
  resource: https://docs.python.org/3/library/logging.html
  title: Python — Logging reference
generated: { by: codex/gpt-6, at: 2026-11-22T02:10:28Z }
---

# Reference

## Design problem and context

A practitioner knows the subject or operation they need, but cannot reliably
remember its exact properties, parameters, constraints, or behavior. They need
to enter at an arbitrary point and compare entries. Narrative order and
inconsistent descriptions make that lookup difficult.

Use this pattern when you can name what the reference covers and who or
what establishes its facts. Choose explanation for a connected account of
why something works, or a how-to when readers need a route to a goal.

## Design response and tradeoffs

Mirror the subject's useful structure in named, addressable entries. Give
comparable items consistent fields and vocabulary, identify the supported
version or scope, and connect each assertion to the maintained system or
other authority. Use concise examples to clarify facts.[^diataxis-reference]

- **Coverage versus scanability:** cover the promised surface while keeping
  each entry easy to inspect.
- **Consistency versus variation:** use common structure without hiding
  meaningful differences between items.
- **Exactness versus maintenance effort:** generated facts can help, but
  semantics, limits, and examples still need review.

Readers can find and compare facts without reading a lesson first. The
resulting material may be poor teaching on its own, and even a small stale
detail can invalidate a decision or procedure that depends on it.

## Example and evidence

Consider someone looking up `NOTSET` in Python’s logging reference. Under
`Logger.setLevel`, a non-root logger with that level inherits its effective
threshold from its ancestors. Under `Handler.setLevel`, the same value lets
through every level the handler receives. Both entries answer a question
about thresholds. Keeping the answer with its object preserves a difference
that a single list of level names could hide.[^python-logging-reference]

The same reference links to tutorials and a cookbook. A reader learning to
log for the first time can choose a lesson. Someone looking up a threshold
mid-recipe can consult one entry and return to the task. Those routes are
visible on the page. Their speed or usefulness for a particular reader
would need to be observed.[^python-logging-reference]

For an example of how the structure of a subject guides lookup, see
[Why reference follows the shape of the thing it describes](../explainers/reference.md).
To build and verify entries, use [How to write reference documentation](../guides/writing-reference-documentation.md).

A [how-to guide](how-to.md) answers a task that spans entries.
An [explainer](explanation.md#when-the-distinction-matters) connects facts
when their significance is what the reader needs to understand.

[^python-logging-reference]: Python, [Logging reference](https://docs.python.org/3/library/logging.html).
[^diataxis-reference]: Daniele Procida, [Reference](https://diataxis.fr/reference/).
