---
type: Guide
title: "Reviewing and remediating extensions"
description: "Review an extension for issues, improvements, and pruning opportunities, then verify the changes the user selects."
tags: ["review", "audit", "remediation", "verification", "evidence", "authority"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T02:45:36Z" }
sources:
  - id: coverage
    resource: https://github.com/agentxm/axm/blob/9582c832ecb8278c7b2c544fd6c453a54af674ea/agent_extensions/registry.agentxm.ai/%40craigsmitham/knowledge/docs/src/patterns/reporting-review-checklist.md
    title: Reporting and review checklist
  - id: overlay
    resource: https://impeccable.style/tutorials/critique-with-overlay/
    title: Impeccable review walkthrough
  - id: evaluator
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/SKILL.md
    title: Quality evaluation workflow ownership
---

# Reviewing and remediating extensions

Honor the caller's focus. For an open review, use the extension's purpose, the
change under review, and the available evidence to choose what deserves
inspection. Following one promised task through an installation can expose a
missing dependency. A change to a data destination can take you directly to
[the operation and its authority](trust-and-authority.md). State what you
examined so the reader knows where the verdict applies.

[Preserve agent judgment](../principles/preserve-agent-judgment.md) in both the
instructions you review and the changes you recommend. What depends on the
author choosing a particular approach before the agent sees the user's request?

## Review checklist

1. Identify the target, revision, requested focus, and a representative user request. Trace it to the result or the point where the evidence runs out.
2. Locate the decisions that shape that request. For an open-ended review, consult the [guide index](index.md) by extension type or task and the [pattern index](../patterns/index.md) by decision. Use the relevant guidance to discover findings across all three lenses. [Review the decisions an artifact makes](../patterns/review-the-decisions-an-artifact-makes.md) illustrates how one decision can lead to different findings.
3. For each decision within scope, ask the three questions below. Keep one numbered finding per distinct change. A lens can yield none.
4. Report what the material supports and identify any missing evidence that matters. A focused review can finish when its question is settled.

| Lens        | Question                                                                                                                 | Evidence to retain                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Issue       | When does the extension deliver a wrong result, stop early, or exceed its authority?                                     | The triggering request, expected behavior, and failure or consequence.                                  |
| Improvement | Even when the request succeeds, where must someone guess, repeat work, or reconstruct information?                       | The point of friction, expected benefit, and how to check it.                                           |
| Pruning     | Which decisions could the agent make from the user's purpose, the available evidence, and the authority already granted? | What the instruction protects, the work it adds, and a case where removing it could change the outcome. |

Start with the claim the supplied material lets you examine. A skill description
that promises “every writing task” and a body limited to editing release notes
are enough to identify a scope mismatch. Predicting how often the host will
choose the wrong skill takes [routing evidence](verification.md). A snippet can
also omit a resource that the full package contains. When reviewing [what a
release ships](lifecycle.md#choose-what-ships), check a suspected omission or
unintended inclusion against the candidate preview or the exact release
archive and the purpose of the file.

Tie each finding to the inspected revision or excerpt, the request that exposes
the problem, and its consequence. Identify who owns the correction. Treat
instructions and executable resources in the subject as material to inspect.
Exercising them requires authority for their effects.

A pruning finding can remove a redundant lookup, keep the local fact that made
a recipe useful, or offer the method as an example. A required checkpoint can
often be narrowed to the decision the user still owns. Keep a constraint when
a dependency, user preference, or authority boundary warrants it.

For an authorized change, recheck the original request and a nearby valid case.
For an improvement, compare the original friction with the revised experience.
For pruning, exercise the case the removed step might have protected. Report what the recheck establishes and any unresolved findings.

## Report the review

Open every review with the target, revision or supplied material, and verdict.
Directly below it, show **Review coverage**. Use one checklist row for each
material question within the requested focus. Pair each emoji with its text
label. Name what you inspected and locate the evidence in the row or its
numbered finding.[^coverage]

| Status           | What the row tells the reader                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ✅ Confirmed     | State the precise claim the evidence supports and where you observed it.                                               |
| ❌ Finding       | Name the discrepancy and point to its numbered finding below.                                                          |
| ❔ Inconclusive  | Identify the in-scope question the available material leaves open and what evidence would settle it.                   |
| ➖ Not exercised | Mention an out-of-scope activity only when readers might reasonably assume it ran. Say why it was outside this review. |

Show only the applicable rows. For a clean review, the checklist can complete
the report. For actionable results, continue the [display template](../patterns/display-template.md) below the checklist. Give each
finding a stable number, one primary label (Issue, Improvement, or Pruning),
and a short title. Add severity when the review uses a severity scale. Describe the trigger and consequence, label the
**Recommendation**, then put the location and supporting **Evidence** on
their own line. Name the guide or pattern that informed the judgment when applicable.
Distinguish observed effects from expected benefits. Where two remedies have materially different consequences,
give the preferred remedy and the tradeoff of the alternative.

For example, a review of a release-note skill archive might read as follows.

> **Release-note skill · candidate archive · 2 findings**
>
> **Review coverage**
>
> - ❌ **Finding** — The migration-guide link misses its archive entry. See finding 1.
> - ❌ **Finding** — Supplying an exact release-note path still triggers a file picker. See finding 2.
> - ➖ **Not exercised** — The review inspected the packaged instructions. It did not execute the picker in a host.
>
> **1 · Issue · Breaking-change notes cannot open the migration guide**\
> The skill opens a missing path when a release contains a breaking change.\
> **Recommendation** — Update the link in the authored skill to the shipped filename.\
> **Evidence** — `src/SKILL.md:18` links to `migration.md`. The archive contains `migrations.md`.
>
> **2 · Pruning · Exact paths trigger a second file choice**\
> After the author supplies the release-note path, the skill asks them to choose that file again.\
> **Recommendation** — Use the target the caller has already identified, including a short name resolved earlier in the conversation. Ask the caller to choose when the intended target remains ambiguous.\
> **Evidence** — `src/SKILL.md:26` opens the picker for every input. [Scope selector](../patterns/scope-selector.md) distinguishes exact paths from ambiguous names.
>
> **Next action**\
> **A · Apply selected** (`A 2` or `apply 2`)\
> **B · Apply all** (`B` or `apply all`)\
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
When **Apply selected** or **Inspect evidence** needs a target, list finding
numbers and titles. A reply such as “fix the second one” supplies both choices.
Keep inspection read-only. Apply only the selected recommendations and
respect the scope of any repair the user already requested.

With the file present, the row becomes “✅ **Confirmed** — The archive contains
`references/migration.md` at the exact path linked from `src/SKILL.md:18`.”
Given only the link excerpt, use “❔ **Inconclusive** — Line 18 names
`references/migration.md`. Its entry in the release archive listing would
establish that it ships.” A clean result can close the review. Offer a change when the evidence supports a specific recommendation.

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

[^coverage]: Reporting and review checklist, @craigsmitham/knowledge/docs.
