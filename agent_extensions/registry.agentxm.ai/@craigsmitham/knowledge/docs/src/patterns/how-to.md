---
type: Pattern
title: How-to guide
description: When competent readers need to achieve a bounded real-world goal, organize adaptable directions around the task, its conditions, and a verifiable result.
tags:
- docs
- how-to
- guide
- diataxis
- explanation
- documentation-pattern
- pattern
- authoring
status: draft
sources:
- id: diataxis-how-to
  resource: https://diataxis.fr/how-to-guides/
  title: Diátaxis — How-to guides
- id: diataxis-tutorials-how-to
  resource: https://diataxis.fr/tutorials-how-to/
  title: Diátaxis — The difference between a tutorial and how-to guide
- id: python-logging-cookbook
  resource: https://docs.python.org/3/howto/logging-cookbook.html
  title: Python — Logging Cookbook
generated: { by: codex/gpt-6, at: 2026-11-22T02:10:28Z }
---

# How-to guide

Choose a how-to guide when someone has work in hand, knows what a good
result looks like, and needs directions for reaching it under the conditions
they face. The reader’s goal gives the guide a beginning and an end, even
when the job crosses several tools.[^diataxis-how-to]

## Recognizing the fit

Suppose a Python programmer wants messages from two modules to reach the
same log. The logging cookbook presents a main module that configures the handlers,
an auxiliary module that emits messages, and sample output containing
records from both. The recipe brings together the pieces the programmer
would otherwise have to assemble from separate interface descriptions.
That recipe assumes the modules run in one process. When several processes
must write to one file, the cookbook offers a separate recipe. The desired
output is similar, but the programmer has to coordinate the writes.[^python-logging-cookbook]

The same programmer might want to practice logging before applying it to
their own modules. A [tutorial](tutorial.md) can provide a controlled
exercise and feedback.[^diataxis-tutorials-how-to] A reader asking which
levels a handler accepts needs
[reference](reference.md). A situation that still requires choosing what
kind of response to make may call for a [playbook](playbook.md). Routine
operational work with prescribed checks, recovery, and escalation may
justify a [runbook](runbook.md).

## What the design costs

A single path is easy to follow until readers meet a condition the author
assumed away. A guide can leave the decision with the practitioner if it
identifies what to look for and how that condition changes the next action.
Each additional branch costs readers attention and gives the maintainer
another path to check. When variants have different goals or a reader can
finish one independently, separate guides can be easier to find and use.

Assess fit by asking what following the directions would let someone
accomplish, what prior skill they could draw on, and how they would
recognize completion. A recipe and its sample output illustrate the design.
They establish no success rate for users of other configurations.

For an account of the judgment a practitioner brings to a task, read
[How-to guides and the work they serve](../explainers/how-to.md). To turn
a task into directions a reader can try, follow
[How to write a how-to guide](../guides/writing-a-how-to-guide.md).

[^diataxis-how-to]: Daniele Procida, [How-to guides](https://diataxis.fr/how-to-guides/).
[^diataxis-tutorials-how-to]: Daniele Procida, [The difference between a tutorial and how-to guide](https://diataxis.fr/tutorials-how-to/).
[^python-logging-cookbook]: Python, [Logging Cookbook](https://docs.python.org/3/howto/logging-cookbook.html).
