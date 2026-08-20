# Agent engineering pack

Installs one knowledge bundle for designing goal-directed AI agent systems,
plus the workflows for authoring and auditing the agent instructions and Agent
Skills that shape them.

The knowledge covers agent behavior, multi-agent coordination, prompts,
context, harness, skills, evaluation, trust, and operations as sections of a
single body rather than as separate bundles. The pack does not add a framework,
runtime, or executable agent.

## Install

```bash
axm install @agentxm/packs/agent-engineering
```

## Contents

| Extension                                   | Purpose                                                             |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `@agentxm/knowledge/agent-engineering`      | The knowledge bundle                                                |
| `@agentxm/skills/author-agent-instructions` | Create or revise AGENTS.md, CLAUDE.md, and scoped instruction files |
| `@agentxm/skills/audit-agent-instructions`  | Audit an instruction system against the knowledge                   |
| `@agentxm/skills/author-agent-skill`        | Create or revise a portable Agent Skill                             |
| `@agentxm/skills/audit-agent-skill`         | Audit an Agent Skill against the knowledge                          |

After installation, browse the workspace Knowledge Base or search for concepts
such as agency choice, control loops, tool-use policy, memory policy, handoffs,
human oversight, instruction files, agent threats, and agent-specific
evaluation.

## License

The pack metadata is MIT licensed. Each dependency retains the license in its
own manifest.
