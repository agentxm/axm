---
name: field-notes
description: >
  Set up and operate field notes: declare what work to observe, then triage
  recorded observations into verified improvements. Use when asked to "watch
  this area", "track friction with X", "what have we been hitting", "review the
  field notes", "promote these observations", or when setting up observation of
  a CLI, a build, a workflow, or an onboarding path. Not for recording an
  individual observation during work — the field-notes rule does that inline.
  Not for debugging a specific failure.
---

# field-notes

Operate the field notes practice: declare **subjects** worth observing, and
triage recorded **notes** into **findings**.

## Responsibility boundary

The `@craigsmitham/rules/field-notes` rule owns in-situ capture. This skill owns
subject lifecycle and batch triage; never use it to create a note or judge
capture eligibility.

Concepts — open before classifying anything under
`.axm/extensions/@craigsmitham/knowledge/field-notes/src/`:
`field-notes-explainer.md` (always), `subject-explainer.md` (declare / graduate /
retire), and `closure-explainer.md` (triage / promote / close).

## Defaults

- **Dry-run first.** Show the proposed edit; write only after confirm, or when
  the user said "apply".
- **Never invent a target condition** the user has not agreed to. Propose;
  do not assert.
- Respect the host's existing paths and instruction file. Do not impose layout.

## Artifact contract

| Artifact | Contract |
| --- | --- |
| Active subjects | `## Field note subjects` in the human-authored part of the workspace instruction file, outside `axm:` managed regions |
| Observed notes | Read and triage `field-notes/<subject>/<YYYY-MM-DD>-<key>.md` |
| Findings | Write and maintain `field-notes/findings/<key>.md` |

## Operations

| Operation | Does | Read |
| --- | --- | --- |
| **declare** | Add a subject; pick mode, scope, target condition, retirement | `references/subjects.md` |
| **graduate** | Survey subject → `target` mode, with a stated target condition | `references/subjects.md` |
| **retire** | Stop collection; keep notes and findings | `references/subjects.md` |
| **triage** (default) | Cluster notes, apply the threshold, promote to findings | `references/triage.md` |
| **close** | Confirm a landed change stopped the class of note | `references/triage.md` |
| **prune** | Drop stale or superseded open notes | `references/triage.md` |

If the request is ambiguous between setup and review: no subjects declared →
**declare**; subjects exist → **triage**.

## Bootstrapping a workspace

When no `## Field note subjects` section exists, the rule is inert. To activate:

1. Ask what area feels expensive. Do not propose subjects unprompted.
2. Decide the mode honestly. If the user cannot state the outcome they want,
   it is `survey` — do not manufacture a target condition to make the subject
   look like `target` mode.
3. Add the section to the instruction file, outside managed regions.
4. Keep it to two or three subjects. More produces noise, not coverage.

## Reporting

Report counts and decisions, not note bodies:

```
Subjects: 2 active (1 survey, 1 target)
Notes:    14 open — 9 clustered into 3 patterns, 5 singletons held
Promoted: 2 findings
Dropped:  1 (transient; recorded so it is not re-litigated)
```

Never present a promoted finding as agreed. Findings propose changes; the user
decides whether any of them land.
