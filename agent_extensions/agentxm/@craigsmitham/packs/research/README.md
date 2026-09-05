# Research

Research turns a bounded subject or explicit questions into fresh-context,
read-only evidence. It keeps framing inspectable, preserves question identity,
cites material external claims, and makes counterevidence, limitations, and
unresolved gaps visible without making the caller's decision.

## What the pack installs

The two extensions are deliberately coupled and are not standalone. The skill
orchestrates the workflow while a fresh subagent performs exactly one framing
or evidence-gathering phase.

| Extension | Role |
| --- | --- |
| `@craigsmitham/skills/research` | Frames bounded research and validates the resulting brief or report |
| `@craigsmitham/subagents/researcher` | Performs one fresh-context, read-only framing or evidence phase |

## Install

```bash
axm packs install @craigsmitham/packs/research
```

Other packs may include these extensions as direct dependencies. That does not
change the Research contract or introduce those packs' workflow semantics.

## Use it when

- You explicitly invoke Research for a bounded evidence workflow.
- You need a Research Brief before gathering evidence.
- Independent framing matters because prior analysis favors a hypothesis,
  diagnosis, or solution.

Use the project's diagnostic workflow for a concrete observed condition.
Ordinary factual lookup does not need this workflow.

## License

The pack metadata and README are MIT-licensed. Each member retains the license
declared in its manifest.
