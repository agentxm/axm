---
type: Pattern
title: "Display template"
description: "When a workflow repeatedly presents the same kind of result, give the reader a stable way to find the evidence and next action."
tags: ["skills", "output", "display", "report", "template"]
status: draft
sources:
  - id: shape
    resource: https://impeccable.style/docs/shape/
    title: Impeccable shape
  - id: critique
    resource: https://github.com/pbakaus/impeccable/blob/b49177d32788f2dc585c42831d845dacf1ebed2c/skill/reference/critique.md
    title: Impeccable critique playbook
---

# Display template

Start with the decision someone makes after reading. A builder reading a brief needs the agreed direction, constraints, and open questions. A maintainer reading a finding needs the affected target, evidence, consequence, and place to act. Impeccable uses distinct shapes for these jobs. Its critique presents the report before asking which issue to address.[^shape][^critique]

An archive review skill could render this Markdown once per reviewed archive.

```markdown
- **Archive** {filename and version}
- **Result** {what the available evidence establishes}
- **Evidence** {inspected entry, listing, or excerpt}
- **Repair** {only for a defect — affected workflow and repair location}
- **Still needed** {only for incomplete evidence — what would settle the question}
```

A complete archive with the expected guide yields a short clean result. A broken reference adds the repair location. An excerpt alone leaves availability open and calls for the archive listing. Show the populated result before any request for input. Omit inapplicable sections. A mandatory “fix” field invites invented work on a clean run.

Keep a short shape inline. Move a long, reused layout into a skill reference and link it at the reporting step. Let opening summaries, progress updates, findings, and receipts use only the fields their readers need. For a receipt, tie the stated effect to the operation result and identify any items still pending.

Render all three archive cases and try a [fresh-reader check](../guides/verification.md#try-the-artifact-with-a-fresh-reader). If the reader must supply or correct a value, combine the display with a [prefilled form](prefilled-form.md).

[^shape]: Shape's sample brief identifies the user’s job, constraints, and remaining decisions.

[^critique]: The critique playbook specifies report structure, conditional evidence, and the placement of follow-up questions.
