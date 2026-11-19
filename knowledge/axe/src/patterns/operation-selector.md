---
type: Pattern
title: "Operation selector"
description: "Give callers a short verb when choosing a workflow changes the deliverable or its effects."
tags: ["skills", "subcommand", "verb", "workflow", "optional operation"]
status: draft
sources:
  - id: quality
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/SKILL.md
    title: Quality skill
  - id: design
    resource: https://impeccable.style/docs/impeccable/
    title: Impeccable main command
---

# Operation selector

Quality exposes review and improvement as different operations. The skill can
also recognize a request to review a model in ordinary language. Impeccable
similarly accepts an outcome in prose or a specialist command.[^quality][^design]
Expose a verb for a choice the caller can make. A procedure the agent chooses
from inspecting the inputs can stay inside the skill.

Suppose a package skill accepts `/package [operation] [scope]`. Document the
forms that produce different outcomes.

| Request                     | Meaning in this design                                    |
| --------------------------- | --------------------------------------------------------- |
| `/package`                  | Orient the caller and show available work.                |
| `/package ./checkout`       | Inspect the checkout package using the default operation. |
| `/package audit ./checkout` | Produce a findings report for checkout.                   |
| `/package ./audit`          | Inspect the package in the directory named audit.         |

Here `/package audit` selects the verb. The explicit path gives a caller a
way to select a target with the same name. Use qualified names where paths
do not fit. Document which rule wins before adding an optional verb to a
slot already used by a [scope selector](scope-selector.md).

Try the explicit verb, a paraphrase, and the colliding target name. Check the
deliverable and requested effects in each case. [Trigger cues](trigger-cues.md)
help a model select the skill. The operation chooses work within it.

[^quality]: Quality, public workflows and free-form intent.

[^design]: Impeccable, general requests and specialist commands.
