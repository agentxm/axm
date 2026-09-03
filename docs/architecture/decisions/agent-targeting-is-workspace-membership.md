---
type: Decision
status: stable
description: Agent selection chooses the workspace's configured agents or filters a listing; an extension applies to every configured agent that can represent it, never to a per-entry subset.
depends-on:
  - ../workspace/agents.md
  - ../extensions/targeting.md
  - ./mcp-local-connection-identity.md
  - ./executable-specifications-authority.md
---

# Agent targeting is workspace membership

## Decision

AXM offers agent selection in exactly two forms: choosing the workspace's
configured agents (`setup`, `agents add`, `agents remove`) and filtering a
listing (`skills list`, `subagents list`). Both validate the identifier against
the supported agent catalog before any work begins. No command accepts an agent
selection that narrows one extension, and no settings entry carries its own
agent subset.

Whether an extension applies to an agent is derived at reconciliation time and
never configured per entry:

```text
applicable(entry, agent) = agent ∈ configuredAgents(scope) ∧ catalogSupports(agent, entry)
```

One rule governs every extension type. A configured agent that cannot represent
an entry is reported as unsupported rather than silently skipped.

## Context

Earlier releases let `mcps add` and `mcps install` record an `agents` inclusion
list on an MCP server entry and offered `--agent` on `skills new`,
`subagents new`, `skills update`, and `subagents update`. Those flags carried
four different meanings: a durable MCP subset, a one-shot narrowing of the first
materialization that the next `sync` reversed, a value that was never read, and
a value echoed only into recovery text. Several accepted identifiers the agent
catalog does not know.

The workspace agents architecture defines one durable target set per scope, and
the agent-specific content architecture already forbids offering a persistent
agent target that workspace configuration cannot represent. Agents are
converging on shared locations for skills and MCP configuration, so a per-entry
subset increasingly names a split that no native file can express; the MCP
projection already refused any subset that divided a shared file. No demand for
per-entry targeting was in evidence, and scope separation together with the
preservation of unowned native entries covers the residual need.

## Consequences

- `--agent` remains only on `setup`, `skills list`, and `subagents list`, and
  an unsupported identifier is rejected when the command line is parsed.
- MCP settings entries no longer accept `agents`. A settings document carrying
  the key fails validation and gates every operation; there is no migration or
  dual read.
- MCP install, add, enable, disable, and uninstall iterate the configured
  agents. The per-entry "not applicable" outcome no longer exists; `unsupported`
  reports an agent whose capability cannot represent the server.
- The lint rule `workspace/mcps-shared-target-compatible` is retired. With no
  subset able to split a shared file, dialect compatibility across agents that
  share one file is a property of the shipped catalog, proven by the catalog's
  own tests.
- A skill or subagent created in the workspace materializes for every
  configured agent that can represent it, skills also to the universal
  location, and preview lists the targets that apply realizes.
- An MCP server imported from one agent's native configuration is recorded once
  and reaches every configured, capable agent on the next reconciliation.
- Bounded agent-specific extension content — capability-conditioned enhancements
  and agent overrides — is unaffected. It adapts content for a target; it does
  not select targets.

The candidate specifications recorded in the agent-targeting-removal batch
review under `specifications/reviews/` own these behaviors once accepted; this
record explains the choice.

## Alternatives

Keeping the MCP subset as the one durable per-entry targeting form was rejected
because it left two targeting models in the product and was unrepresentable
whenever configured agents shared a native file. Making `--agent` on the
creation commands durable by recording a subset on each skill or subagent entry
was rejected because it would generalize the same unrepresentable model to every
extension type. Leaving the inert flags in place was rejected because an accepted
input with no disclosed effect misleads the operator.

## Reconsideration

Reconsider if native agent configuration formats gain a portable, first-class
way to scope one entry to a subset of the agents that read a shared file, or if
evidence shows workspaces that need one extension for some configured agents but
not others and cannot express that through scope separation.
