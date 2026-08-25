---
type: Guide
title: Documentation workflow guide
description: How to improve documentation iteratively — choose something, assess against craft, take one action, publish — without empty form shells or top-down plans.
tags: [docs, craft, workflow, remediation, authoring, how-to, diataxis]
status: stable
sources:
  - id: diataxis-workflow
    resource: https://diataxis.fr/how-to-use-diataxis/
    title: Diátaxis — Diátaxis as a guide to work
  - id: diataxis-workflow-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/how-to-use-diataxis.rst
    title: Diátaxis source — how-to-use-diataxis.rst
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T17:08:26Z
---

# Documentation workflow guide

Use this when you need to **remediate or grow existing documentation** with
portable craft. For *why* iteration and inside-out structure work, read
[Documentation workflow](../explainers/documentation-workflow.md). For writing one new document
from a named need, use [Documentation craft guide](documentation-craft.md).

## Goal

Ship a small, real improvement that better serves one reader need — without
waiting for a full restructure or inventing empty form folders.

## Steps

1. **Choose something in front of you** — the open file, the last page you
   read, or a random page if you have no preferred target. Prefer a **small**
   unit (page, section, paragraph) over a whole site map. Do not start by
   inventorying every problem in the corpus.
2. **Name the need it should serve** — learning, goals, information, or
   understanding. Use the compass in
   [Documentation craft](../explainers/documentation-craft.md) if the form is unclear
   (*action or cognition? acquisition or application?*).
3. **Assess against that need** — Does form match job? Wrong voice? Tutorial
   disguised as how-to? Explanation or reference bulk interrupting action?
   Missing facts? Stale steps? What user need is actually represented?
4. **Decide one next action** that improves the page *now*. Examples:
   - Split mixed jobs; keep one primary and link the rest
   - Move digression out; leave a short link
   - Fix form (title, framing, steps vs inventory vs discussion)
   - Correct a stale command or incomplete inventory item
   - Delete empty scaffolding that only named a form with no content
5. **Do only that action** — edit the unit; do not expand into a parallel
   redesign of neighboring trees.
6. **Treat the change as complete** — commit or publish when the unit is
   better on its own. Do not hold it for a larger tranche.
7. **Repeat** — pick the next obvious unit (often adjacent, or whatever is
   now in front of you). Let structure consolidate only when material clearly
   demands a new group or index entry under host conventions. When that
   threshold is reached, use [Organizing and naming
   documentation](organizing-and-naming-documentation.md) to choose the
   collection's axis and migrate paths deliberately.

## Preconditions

- Access to the documentation under change
- Enough product or domain truth to avoid inventing behavior
- Awareness of host rules (paths, indexes, validators) so you apply them
  last — not invent portable layout

## Pitfalls

- **Empty four-form shells** — creating `tutorials/` / `how-to/` /
  `reference/` / `explanation` folders (or equivalent) with nothing in them
- **Big-picture first** — freezing work until a full IA plan and rewrite land
- **Unpublished megabatches** — holding many good small fixes until a
  “substantial” release
- **Tear-down default** — rewriting from zero when iterative form fixes would
  expose and fix problems faster
- **Plan-as-completion** — treating the four forms as a mandatory finish line
  rather than a guide for the next edit
- **Skipping assessment** — moving files without asking which need the content
  serves

## Related

- [Documentation audits](../explainers/documentation-audits.md) · [Auditing documentation](auditing-documentation.md)
- [Documentation workflow](../explainers/documentation-workflow.md)
- [Documentation craft](../explainers/documentation-craft.md)
- [Documentation craft guide](documentation-craft.md)
- [Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md) · [Organizing and naming documentation](organizing-and-naming-documentation.md)
- [Documentation quality](../explainers/documentation-quality.md)
- [Tutorial guide](tutorial.md)
- [How-to guide](how-to.md)
- [Reference guide](reference.md)
- [Explanation guide](explanation.md)
