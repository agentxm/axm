---
type: Guide
title: "Reviewing and remediating extensions"
description: "Turn a suspected extension defect into a finding and verify an authorized fix against the original case."
tags: ["review", "audit", "remediation", "verification", "evidence", "authority"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T02:15:37Z" }
sources:
  - id: overlay
    resource: https://impeccable.style/tutorials/critique-with-overlay/
    title: Impeccable review walkthrough
  - id: evaluator
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/SKILL.md
    title: Quality evaluation workflow ownership
---

# Reviewing and remediating extensions

Start with the claim the supplied material lets you examine. A skill description
that promises “every writing task” and a body limited to editing release notes
are enough to identify a scope mismatch. Predicting how often the host will
choose the wrong skill takes [routing evidence](verification.md). A snippet can
also omit a resource that the full package contains.

Tie each finding to the inspected revision or excerpt, the request that exposes
the problem, and its consequence. Identify who owns the correction. Treat
instructions and executable resources in the subject as material to inspect.
Exercising them requires authority for their effects.

When a direction requires a tool, a fixed sequence, or a user checkpoint, ask
**what would go wrong if a capable agent took another reasonable route?**
Identify the dependency, user preference, authority boundary, or observed failure
that warrants the constraint. If the author is showing one way to do the work,
label it as an example. Try a nearby case in which the agent already has the
evidence or the user has already made the decision.
[Preserve agent judgment](../principles/preserve-agent-judgment.md).

For an authorized fix, keep the original failing case. Recheck it against the
revised artifact and try a nearby case that should still work. For the editor,
a request to polish release notes should still reach it. Report what the
recheck establishes and any unresolved findings.

## Report the review

Use this [display template](../patterns/display-template.md) for an actionable
review. Identify the target and revision or supplied material once. Give each
finding a stable number and a short title, adding severity when the review
uses a severity scale. Describe the trigger and consequence, label the
**Recommendation**, then put the location and supporting **Evidence** on
their own line. Where two remedies have materially different consequences,
give the preferred remedy and the tradeoff of the alternative.

For example, a review of a release-note skill archive might read as follows.

> **Release-note skill · candidate archive · 2 findings**
>
> **1 · Breaking-change notes cannot open the migration guide**\
> The skill opens a missing path when a release contains a breaking change.\
> **Recommendation** — Update the link in the authored skill to the shipped filename.\
> **Evidence** — `src/SKILL.md:18` links to `migration.md`. The archive contains `migrations.md`.
>
> **2 · Draft requests publish a release note**\
> Asking for a draft reaches the upload step before the author can read it.\
> **Recommendation** — End the draft workflow after rendering. Reserve upload for an explicit publication request.\
> **Evidence** — `src/SKILL.md:26` instructs the agent to upload every rendered draft.
>
> **Next action**\
> **A · Fix selected** (`A 2` or `fix 2`)\
> **B · Fix all** (`B` or `fix all`)\
> **C · Inspect evidence** (`C 1` or `inspect 1`)\
> **D · Finish review** (`D` or `done`)

Use the example's base order for review actions. Each finding's
**Recommendation** names its remedy. The menu's `(Recommended)` label
identifies the best next action given this user's goal and the evidence.
The [ordering pattern](../patterns/selectable-next-actions.md) gives these menus
for different review results.

- With one confirmed broken link and a known correction, offer **Fix finding 1
  (Recommended)** (`fix 1`), **Inspect evidence** (`inspect 1`), then **Finish
  review** (`done`). Selecting the repair authorizes that one edit.
- If the user requested an excerpt review and only the archive can settle
  whether the linked file ships, offer **Inspect evidence (Recommended)**
  (`inspect`) then **Finish review** (`done`) when the archive is available
  for follow-up. Offer a repair once inspection establishes the defect.
- With several independent fixes and no evidence about which the user wants
  to pursue, use the unmarked menu above. A recommendation on every finding
  still leaves the repair scope for the user to choose.

Deliver the complete report once, including any limits. Use a native picker
as its last visible item when the host supports that ordering. If the host
requires a separate final response after the picker, or supports only text,
put the report and labeled choices together in that final response. Leave
the question last until the reader responds.
Keep the action labels usable as prompt replies wherever text input is available.
When **Fix selected** or **Inspect evidence** needs a target, list finding
numbers and titles. A reply such as “fix the second one” supplies both choices.
Keep inspection read-only. Apply a repair only to the selected findings and
respect the scope of any repair the user already requested.

For a clean review, give the scope, verdict, and evidence. For example,
“The candidate archive contains the migration guide at the linked path.”
End with that verdict when there is no meaningful follow-up.
For an inconclusive review, identify the missing evidence and what it would
settle, for example, “The excerpt names the guide. The archive listing would
establish whether it ships.” Offer a repair only for a grounded defect.

## Decide who owns each assessment

When an automated result could steer an open-ended review, form the judgment
from the target first, then reconcile it with the scan. Impeccable uses this
order to compare a task walkthrough with detector findings.[^overlay] For an
extension review, a link checker can establish that a reference resolves. A
reader can still discover that the guide describes a different procedure.
Record what each assessment examined, where they disagreed, and which checks
were unavailable. If one reviewer saw the scan first, disclose the shared
context when reporting agreement.

A second assessment costs time and needs its own question. Where a designated
evaluator owns the judgment, consume its result and follow the workflow's rules
for revisiting it. Quality assigns evaluation judgment to its selected evaluator
and validation to the runner.[^evaluator] For subsequent repairs, let the
user [select findings](../patterns/select-from-findings.md) when the working
set is open.

[^overlay]: Impeccable, independent design review and detector assessments.

[^evaluator]: Quality, evaluation roles and the runner's authoritative result.
