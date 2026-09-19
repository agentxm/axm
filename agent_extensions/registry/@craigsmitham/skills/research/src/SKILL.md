---
name: research
description: Explicitly invoked stage that orchestrates fresh-context, read-only research from a bounded subject or explicit questions. Select only when the user directly invokes `$research` or the corresponding host control; never select it from an unprefixed natural-language request, even when that request resembles research. Produces a Research Brief when needed and a question-by-question report with citations, counterevidence, limitations, implications, and unresolved gaps. Not for ordinary factual lookup, diagnosis of an observed failure, recommendations, or applying findings.
---

# Research

Reduce one bounded uncertainty through inspectable framing and evidence. The
calling agent owns scope, delegation, acceptance, and presentation; a fresh
`researcher` subagent performs each framing or evidence phase.

Research is read-only end to end. Neither context may modify files or systems,
contact people, submit forms, purchase access, or apply findings. A later action
requires a separate request after Research ends.

Fresh delegated context is required. If it is unavailable, return `blocked` and
name the missing capability; do not perform either phase in the calling context.

## Workflow

1. Bind the intended use, subject and boundary, observable context,
   constraints, allowed read-only sources, supplied time, question, source, or
   cost limits, and whether only framing is requested.
2. Treat a complete Research Brief or one or more explicit research questions
   as framed input. Preserve supplied question IDs and wording; assign `Q1`,
   `Q2`, and so on only when explicit questions lack IDs.
3. When questions are absent, read `references/framing-research.md`. Prepare
   only the bounded framing input. If the request contains originating analysis,
   remove its hypotheses, diagnoses, conclusions, recommendations, proposed
   fixes, and favored alternatives before delegating one fresh `frame` phase.
   Validate the returned Research Brief against that reference. Stop visibly on
   invalid or blocked framing.
4. If framing alone was requested, return the generated Research Brief or the
   supplied framed input and stop.
5. Delegate one fresh `execute` phase with only the validated Research Brief or
   explicit questions. Pass the allowed read sources and supplied limits;
   prohibit mutation and subdelegation.
6. Validate the Research report: every input question has one dashboard row and
   one matching finding; IDs and wording remain stable; material external claims
   have nearby citations; credible counterevidence and limitations are visible;
   limits are honored; and no unsupported recommendation or decision appears.
7. Return generated framing followed by the Research report, or only the report
   for supplied framing. End after the artifact or structured failure; do not
   begin another workflow.

## Delegation contract

Give the Researcher one bounded assignment containing:

- **Phase:** `frame` or `execute`;
- **Input:** bounded framing input, a complete Research Brief, or explicit
  questions, including intended use and boundary;
- **Read authority:** allowed source classes and the prohibition on mutation;
- **Limits:** supplied time, question, source, or cost caps, or `None supplied`;
  and
- **Output:** the required artifact and its acceptance conditions.

Subdelegation is prohibited. Do not pass expected conclusions, hidden grading
criteria, unrelated history, or more context than the phase needs.

## Failure result

Use this shape when a phase cannot responsibly complete:

```markdown
# Research result

- **Status:** `blocked` or `invalid`
- **Phase:** `frame` or `execute`
- **Reason:** concrete missing capability, input, or authority
- **Preserved state:** valid brief, question IDs, evidence, or partial coverage
- **Resume condition:** the smallest condition that could resume the phase
```

A supplied limit ending evidence gathering is not a phase failure. Return a
valid partial report and mark unfinished questions `Not reached`.

The job succeeds when framing remains inspectable, every question is accounted
for with traceable evidence, uncertainty remains visible, and no state changes.
