---
okf_version: "0.2"
---

# Software engineering

Portable engineering craft for a repository's execution surface: how units of
work are defined, layered, cached, and invoked by humans, coding agents, and
CI. Use this bundle for tool-neutral guidance on task graphs, script surfaces,
and invocation contracts rather than for a software-change method, requirements
and architecture lifecycle, work items, documentation craft (the docs bundle),
or language and framework APIs.

## Execution surface

- [Command execution strategy](command-execution.md) - Use when a repository's task runner, package-script surface, and wrapper scripts have accreted into competing invocation paths, or when deciding where a new unit of work belongs; establishes a task-graph-canonical layering with deliberate caching and a bounded script surface that humans, agents, and CI can share.
