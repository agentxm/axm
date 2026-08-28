# Research

Research turns a bounded subject or explicit questions into fresh-context,
read-only evidence. When questions are absent, it first returns a concise
Research Brief; a separate fresh Researcher then gathers evidence and produces
a question-by-question report.

The workflow preserves question identities, cites material external claims,
shows credible counterevidence and limitations, and records unresolved gaps. It
does not modify state, make the caller's decision, or apply its findings.

## Use it when

- You explicitly invoke Research for a bounded evidence workflow.
- You need a Research Brief before evidence gathering.
- Independent framing matters because prior analysis contains a favored
  hypothesis, diagnosis, or solution.

Use `investigate` instead to diagnose a concrete observed condition. Ordinary
factual lookup does not need this workflow. On OpenAI hosts, Research is
explicit-selection-only and does not activate from ordinary research-like
language.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

Research is not standalone; it requires the pack's fresh-context Researcher
subagent. Gen Stack is the current distribution bundle, but Gen Stack stage and
corpus semantics are not part of the Research workflow.

## Examples

Frame questions without gathering evidence:

```text
/research Frame the questions most likely to change the decision about a
limited pilot. Stop after returning the Research Brief.
```

Research explicit questions with a concrete limit:

```text
/research Use current public evidence to answer Q1 and Q2 below. Preserve both
IDs and stop after five sources. ...
```

## Version 3.0

Version `3.0.0` incorporates Research Brief framing, requires fresh delegated
contexts, removes named depth modes in favor of explicit limits, and simplifies
the report contract. Gen Stack-specific handoff and corpus disposition now
belong to the Gen Stack caller rather than this skill.

The former Question skill and QRSPI pack are deprecated. Framing-only callers
should invoke Research and request that it stop after the Research Brief.

## License

MIT
