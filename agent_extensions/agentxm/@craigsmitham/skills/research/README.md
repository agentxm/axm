# Research

Orchestrates a bounded, read-only investigation from either a Research Brief,
explicit questions, or an unframed subject. When framing is absent, it uses the
QRSPI Question skill to produce a visible Research Brief, then delegates
execution to the pack's fresh-context, read-only Researcher subagent. The
calling agent briefly discloses that assistance, reviews the returned evidence,
and presents the research artifact without changing state or promising that it
will apply the findings.

Every question keeps a stable identifier from the input brief through a summary
dashboard and detailed finding. The report includes citations, counterevidence,
confidence, decision implications, evidence that could change each answer, and
an actionable gap list.

## Use it when

- You explicitly select Research through the host's user-invocation control or
  ask the agent to use the Research skill by name.
- You have a research brief, explicit questions, or a subject ready to
  investigate.
- You need current evidence gathered and synthesized rather than questions
  merely framed.
- You want a stable report shape across rapid, standard, and deep research.

Use the Question skill directly when you only want questions and no research.
Do not use Research to create a survey or interview guide or to make a decision
the caller did not authorize.

On OpenAI hosts, Research is explicit-selection-only: its
`agents/openai.yaml` policy disables implicit model invocation. Ordinary
requests to investigate, browse, search, look up, verify, analyze, compare,
audit, or gather evidence do not activate this skill unless the user explicitly
selects or names it.

## Install

```bash
axm packs install @craigsmitham/packs/qrspi
```

Research is not standalone; it requires the QRSPI Question skill and Researcher
subagent.

## Example

```text
$research Execute this Research Brief in rapid mode. Preserve the question IDs,
use evidence current through today, and stop after two hours: ...
```

An unframed invocation is also supported:

```text
$research Investigate whether a public library should pilot extended weekend
hours. Use standard depth and current public evidence.
```

That path returns the generated Research Brief followed by the Research report.

## Migration from 1.x

Version 2.0.0 changes Research from implicitly model-invokable to explicitly
user-invoked on OpenAI hosts. Select it with the host's skill control, such as
`$research` in Codex, or ask the agent to use the Research skill by name.
Requests that merely use research-adjacent language no longer activate it.

The entire Research invocation is also read-only in 2.0.0. That boundary
includes both the calling agent and every delegated researcher. Research may
inspect authorized evidence and present findings, but it does not modify state,
apply findings, or say that the calling agent or researcher will make a
subsequent change; acting on the report belongs to a separately invoked
workflow.

Other hosts receive the narrowed portable description, but enforcement of
explicit-only invocation depends on whether the host supports an equivalent
policy. Roll back to 1.0.0 only when implicit model selection is intentionally
required.

## Migration from 0.x

Version 1.0.0 moves Research from a standalone executor to the QRSPI
composition. Replace direct skill installation with the pack installation shown
above. Supplied Research Briefs and explicit questions retain their stable
report behavior; subject-only requests now generate a visible Research Brief
before execution. A host must provide a fresh-context researcher subagent and
read-only research tools. If it cannot, the workflow returns a blocked result
instead of executing in the calling context. Roll back to 0.0.3 only when the
older standalone, pre-orchestrated behavior is intentionally required.

## Output

The report always contains research context, an executive synthesis, a question
dashboard, one detailed finding per question, cross-question synthesis,
emergent findings, unresolved gaps, and a source-and-method register.
Research stops after presenting the brief, report, or visible failure result.

## License

MIT
