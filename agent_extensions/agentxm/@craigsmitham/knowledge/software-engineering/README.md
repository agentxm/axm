# Software engineering knowledge

Portable engineering craft for a repository's execution surface: how units of
work are defined, layered, cached, and invoked by humans, coding agents, and
CI. It is intended for engineers and agents shaping a repository's task
runner, package-script surface, and wrapper scripts into one coherent
invocation contract, independent of language or build tool.

Use it for the command execution strategy — task-graph-canonical layering,
self-sufficient targets, deliberate cache intent, and a bounded script
surface. It is not the software-change method, Requirement or architecture
lifecycle, or work-item guidance (install the Gen Stack knowledge for those),
documentation craft, or a language or framework reference.

Earlier versions of this bundle (through 1.1.0) held design-change and
work-item guidance; that content now lives in
`@craigsmitham/knowledge/gen-stack`, and this bundle owns the
execution-surface scope from 2.0.0 onward.

Install it with:

```bash
axm install @craigsmitham/knowledge/software-engineering
```

Then browse its discovery index or search installed concepts, for example:

```bash
axm knowledge concepts search '"command execution"'
```

This knowledge package is licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license (`CC-BY-SA-4.0`). The
reciprocal license applies to the package content; it does not automatically
apply to unrelated output created while using the package.
