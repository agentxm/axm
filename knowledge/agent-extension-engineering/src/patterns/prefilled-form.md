---
type: Pattern
title: "Prefilled form"
description: "When the agent can recover part of a brief, show known values and proposals so the user can correct just the decisions that remain."
tags: ["skills", "form", "defaults", "user interaction", "correction"]
status: draft
sources:
  - id: init
    resource: https://impeccable.style/docs/context/
    title: Impeccable context files
  - id: answers
    resource: https://design-system.service.gov.uk/patterns/check-answers/
    title: GOV.UK check answers
  - id: entry
    resource: https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html
    title: W3C understanding redundant entry
---

# Prefilled form

Use a form when several related choices shape the same deliverable and some answers are already available. Impeccable's setup reads project context, asks for missing details, and records the agreed brief.[^init] GOV.UK's check-answers pattern lets people change individual answers. W3C describes reusing information entered earlier in the same process.[^answers][^entry]

For a skill author deciding how a reviewer should operate, the agent could show:

| Field                     | Draft               | Basis                                |
| ------------------------- | ------------------- | ------------------------------------ |
| Target                    | Release archive     | Named in this request                |
| Audience                  | Package maintainers | Suggested by last release's brief    |
| Who may start the review? | Open                | The brief names no invocation policy |

Invite a reply such as “Keep the target, change the audience to installers, and make it user-invoked.” Retain the other answers. If a correction makes another answer obsolete, reopen that field and explain the dependency. Label examples as examples, leave unexpressed preferences open, and say what accepting the form does. Confirming the design can finish the brief while implementation remains a separate request.

Use a plain text exchange for a single missing fact. For a longer form, make the same corrections possible through text or a host picker. Try a known target, a stale suggested audience, and an open invocation choice. Check that the user can correct the audience alone and that dismissing the form leaves the choice open.

[^init]: Impeccable, recording project context and handling disagreement with the implementation.

[^answers]: GOV.UK, changing an answer and returning to the summary.

[^entry]: W3C, reusing an answer within a process.
