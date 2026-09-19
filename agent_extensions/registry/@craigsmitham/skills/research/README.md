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

Use the project's diagnostic workflow for a concrete observed condition.
Ordinary factual lookup does not need this workflow. Research is
explicit-selection-only and does not activate from ordinary research-like
language; supported hosts use their native invocation-policy control to enforce
that portable contract.

## Install

```bash
axm packs install @craigsmitham/packs/research
```

Research is not standalone; it requires the pack's fresh-context Researcher
subagent. The Research pack is the supported installation unit for both
extensions.

## Examples

Frame questions without gathering evidence:

```text
$research Frame the questions most likely to change the decision about a
limited pilot. Stop after returning the Research Brief.
```

Research explicit questions with a concrete limit:

```text
$research Use current public evidence to answer Q1 and Q2 below. Preserve both
IDs and stop after five sources. ...
```

## Version 3.0.1

Version `3.0.1` moves coupled distribution to the dedicated Research pack. The
Research workflow and its authority remain unchanged.

## Version 3.0

Version `3.0.0` incorporates Research Brief framing, requires fresh delegated
contexts, removes named depth modes in favor of explicit limits, and simplifies
the report contract. Caller-specific handoff and corpus disposition belong to
the caller rather than this skill. Framing-only callers should invoke Research
and request that it stop after the Research Brief.

## License

MIT
