---
name: delivery
description: >-
  Use when a software change needs to land on main, ship, roll out, or be
  confirmed in use, including questions about whether it can advance.
  Also assess a repository’s path to production or improve its hooks,
  verification, CI, deployment, or release feedback.
---

# Delivery

Guide the current change through **Implement → Land → Release → Confirm**.
“Ship this fix” calls for action. “Can this land?” calls for a readiness
decision. Start at the decision in front of the implementer and follow the
change as far as the request authorizes. Use the same behavior for an ordinary
request and for `$delivery`.

Two named modes work on the **delivery process**. Use `$delivery assess` for
“Where are changes waiting?” and `$delivery improve` for “Make this check
faster.” Route equivalent plain-language requests the same way. Assessing
whether a particular fix is ready is ordinary change guidance.

Use the repository’s actual commands, required checks, permissions, and
release cadence. Choose the fastest path with sufficient evidence for the
decision. When timing is comparable, prefer lower compute and developer
effort. Count queueing and rework in elapsed time.

## Deliver a change

- **Implement.** Establish the intended behavior and audience. Work in a
  checkout, temporary branch, or worktree as appropriate. Exercise the changed
  path. For a reproducible defect, show the original failure and the correction.
- **Land.** The implementer owns integration on shared main. Compare the
  candidate with current main. Keep results whose inputs still hold and check
  interactions affected by intervening changes. Follow the repository’s merge
  policy, resolve conflicts, and verify the landed revision. For a readiness
  question, run the relevant checks and report what can advance.
- **Release.** Deploy or publish the artifact built from a verified main revision
  on the repository’s cadence. Follow an authorized release through rollout to
  its intended audience. Track the revision, target, checks, and rollout order.
  If a scheduled release is pending, identify its trigger and owner.
- **Confirm.** Exercise or observe the intended behavior in use. On an adverse
  result, contain the effect within scope and check recovery. If confirmation
  is pending, state what was observed, what still needs observing, and who
  or what will observe it.

For the delivery model and its measures, use the shared SWE concept
`@craigsmitham/knowledge/sdlc#release-engineering/foundations/delivering-a-software-change`.
For hook placement, concurrent integration, and rollout decisions, use
`@craigsmitham/knowledge/sdlc#release-engineering/guides/direct-to-main-delivery`.
Resolve either through host discovery or `axm knowledge concepts get '<reference>'`.

## Assess the path to production

Trace a representative change through commits, check runs, artifacts, rollout,
and use. Keep the assessment read-only. Present the report in this order.

1. **Overall summary.** Name the change and scope. Say what works, where the
   evidence warrants attention first, and which outcome is still unknown.
2. **Step summaries.** Give **Implement → Land → Release → Confirm** one
   sentence each for an end-to-end assessment. For a focused request cover
   the affected steps. Place a check under the decision it informs. Describe
   what actually ran and distinguish configuration from observed results.
3. **Findings by step.** Number findings across the report, group them under
   their steps, and rank them within each step. A healthy step can stand on
   its summary. For each finding show **Current** with evidence, **Acceptable**
   with the applicable limit or condition, and **Target** with the recommended
   result. Explain the consequence and how to verify the improvement.

Compare like measures or observable states. Identify the inputs, environment,
sample, and time window that matter. Separate queue time from execution.
Label limits and targets **agreed** or **proposed**, with their basis. Only
call a measured result outside tolerance against an agreed limit. State
“no agreed limit” or “unverified” when the threshold or evidence is missing.
Include **Stretch** only when it changes a tradeoff. Give fixed obligations
a pass/fail result when exercised.

Put selectable actions beside the findings, with unique letters and concrete
effects. Mark one `(Recommended)` when the evidence favors it. Let the user
reply by letter, action name, finding with a verb, a combination, or `done`.
Use a native picker if it can be the final choice with the same step and
finding labels. Otherwise the report itself is the menu. Wait for a selection
before acting. Investigating a finding stays read-only. An implementation
selection carries that finding, its baseline, target, and verification into
**improve**. Resolve short replies against the choices actually displayed.

For a worked report and guidance on choosing limits, consult
`@craigsmitham/knowledge/sdlc#release-engineering/guides/assessing-the-path-to-production`.

## Improve the path to production

Start with a selected finding or the requested outcome. Establish a baseline
from comparable runs or a focused reproduction. Identify which behavior,
failure modes, and required checks the change must still cover. For a design
question, recommend a concrete change and explain how to test it. For an
implementation request, make the bounded change through the normal workflow.

Repeat the relevant workload. Exercise a valid change and a representative
failure the check must still catch, using an isolated fixture when needed.
Report the before-and-after result, verification coverage, and any remaining
production measurement. Distinguish observed gains from expected savings.
