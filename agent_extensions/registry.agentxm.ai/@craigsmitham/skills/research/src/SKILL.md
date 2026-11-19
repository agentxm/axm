---
name: research
disable-model-invocation: true
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

## Phase selection

A complete Research Brief or explicit questions are framed input. Preserve
supplied IDs and wording; assign `Q1`, `Q2`, and so on only when IDs are absent.

Without questions, delegate a fresh `frame` phase using
[Framing bounded research](references/framing-research.md). Its input preserves
the bounded subject, intended use, observable context, constraints, read
sources, and supplied limits while excluding originating hypotheses,
diagnoses, conclusions, recommendations, fixes, and favored alternatives.
Validate the returned Brief against that contract. Invalid or blocked framing
stops the workflow visibly.

Framing-only requests end with the Brief or supplied framed input. Otherwise,
a separate fresh `execute` phase receives only the validated Brief or explicit
questions, read authority, and supplied limits. The researcher follows
[Evidence practice](references/evidence-practice.md) and the
[Research report contract](references/report-contract.md).

Validate question accounting, evidence, limits, and presentation against those
contracts. Return generated framing before the report; supplied framing needs
only the report. End with the artifact or structured failure, without applying
findings or starting another workflow.

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
