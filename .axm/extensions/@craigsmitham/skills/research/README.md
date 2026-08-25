# Research

Orchestrates a bounded investigation from either a Research Brief, explicit
questions, or an unframed subject. When framing is absent, it uses the QRSPI
Question skill to produce a visible Research Brief, then delegates read-only
execution to the pack's fresh-context Researcher subagent.

Every question keeps a stable identifier from the input brief through a summary
dashboard and detailed finding. The report includes citations, counterevidence,
confidence, decision implications, evidence that could change each answer, and
an actionable gap list.

## Use it when

- You have a research brief, explicit questions, or a subject ready to
  investigate.
- You need current evidence gathered and synthesized rather than questions
  merely framed.
- You want a stable report shape across rapid, standard, and deep research.

Use the Question skill directly when you only want questions and no research.
Do not use Research to create a survey or interview guide or to make a decision
the caller did not authorize.

## Install

```bash
axm packs install @craigsmitham/packs/qrspi
```

Research is not standalone; it requires the QRSPI Question skill and Researcher
subagent.

## Example

```text
/research Execute this Research Brief in rapid mode. Preserve the question IDs,
use evidence current through today, and stop after two hours: ...
```

An unframed invocation is also supported:

```text
/research Investigate whether a public library should pilot extended weekend
hours. Use standard depth and current public evidence.
```

That path returns the generated Research Brief followed by the Research report.

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

## License

MIT
