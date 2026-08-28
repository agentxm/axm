# Researcher

Researcher is the fresh-context, read-only worker used by the Research skill.
One assignment either frames a Research Brief or executes supplied questions as
an evidence-backed report. It never performs both phases in one context.

The subagent accepts only bounded assignments that state the phase, input, read
authority, limits, and required output. It does not change external state, make
the caller's decision, or subdelegate its work.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

Researcher is not standalone; install it with the Research skill through a
declared pack. Gen Stack is the current distribution bundle, not part of the
worker's research semantics.

## Delegation example

```text
Phase: execute
Input: the supplied Research Brief
Read authority: current public sources only; no mutation
Limits: five sources
Output: the Research report contract
```

## License

MIT
