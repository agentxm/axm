---
type: Explainer
title: Documentation workflow
description: Explains useful incremental documentation improvement and structure that follows reader needs without prescribing delivery units.
tags: [docs, craft, workflow, remediation, diataxis, explanation]
status: stable
generated: { by: codex/gpt-6, at: 2026-11-11T19:48:50Z }
sources:
- id: diataxis-workflow
  resource: https://diataxis.fr/how-to-use-diataxis/
  title: "Di\xE1taxis \u2014 Di\xE1taxis as a guide to work"
- id: diataxis-workflow-src
  resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/how-to-use-diataxis.rst
  title: "Di\xE1taxis source \u2014 how-to-use-diataxis.rst"
- id: diataxis-start
  resource: https://diataxis.fr/start-here/
  title: "Di\xE1taxis \u2014 Start here"
- id: diataxis-start-src
  resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/start-here.rst
  title: "Di\xE1taxis source \u2014 start-here.rst"
- id: diataxis-application
  resource: https://diataxis.fr/application/
  title: "Di\xE1taxis \u2014 Applying Di\xE1taxis"
- id: prior-documentation-workflow
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/docs/src/guides/documentation-workflow.md
  title: Documentation workflow guide
---

# Documentation workflow

Portable **understanding** of how to *apply* documentation craft over time —
especially when remediating or growing an existing body of docs — without
imposing a top-down information-architecture project.

The reader-need forms and quality principles live in
[Documentation craft](documentation-craft.md). Selected patterns supply the
appropriate document design; [organization guidance](../guides/organizing-and-naming-documentation.md)
addresses collection structure.

## Guide, not plan

Craft describes a complete picture of documentation needs. That picture is a
**guide** for orientation — not a **plan** you must finish before publishing
anything useful.

You use the map to check that you are in the right place and moving in a
helpful direction. You do not use it as a checklist of four empty sections
that must exist before the work is “done.”

## Structure emerges from the inside

Structure matters, but **using form-aware craft does not mean spending energy on
correct top-level structure first**.

Do **not** create empty shells named for the four reader-need forms with nothing in them.
That freezes a folder tree without improving a single reader job.

Instead, improve pages according to reader-need principles until the material
*demands* clearer grouping. Top-level shape forms **from the inside**: many
small, form-correct edits make structure obvious later — not the reverse.

## Bounded, useful improvements

Documentation changes alongside the product. A small improvement can be useful
without waiting for a complete redesign. The reader need and requested scope
determine the unit of work: a correction, coordinated set of pages, or structural
change can each be appropriate. Craft does not require an arbitrary starting
page, exactly one action, or a separate commit or publication for each unit.

## Complete, not finished

Good documentation growth resembles **well-formed organic growth**: healthy
local cells, rules appropriate to each kind of content, structure guaranteed
from within rather than imposed from above.

Like a living plant, documentation is **never finished** — product and needs
keep changing. At every stage it can still be **complete**: useful at its
current maturity, structurally healthy enough for the next step, and ready to
grow again.

Tear-down-and-rebuild is rarely required for form-aware craft. Prefer continuous
adaptation over waiting for a perfect greenfield restructure.

## What this does not prescribe

- Repository folder trees or four mandatory top-level sections
- Project management methodology beyond small iterative improvement
- Host validators, metadata schemas, or site generators

Apply host conventions for paths and indexes when they exist; do not invent a
portable layout scheme in the name of workflow.

## Related

- [Documentation craft](documentation-craft.md)
- [Documentation quality](documentation-quality.md)
