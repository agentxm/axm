---
type: Reference
title: Skill boundaries and neighboring elements
description: How skills differ from agent definitions, instructions, knowledge, prompts, tools, scripts, subagents, hooks, and plugins.
tags: [agent-skills, boundaries, agent-definitions, instructions, tools, subagents, plugins]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Skill boundaries and neighboring elements

Use the element whose primary job matches the responsibility. A skill may use
neighboring elements; it should not absorb their authority merely because they
can be placed in the same directory or plugin.

| Element                           | Primary job                                                                                           | Boundary from a skill                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Agent definition or configuration | Define a goal-directed actor's role, tools, memory, authority, coordination, and control policy       | Owns the actor and its behavior rather than one reusable job                         |
| Instruction file or rule          | Establish always-on invariants and routes                                                             | Applies before a task-specific workflow is selected                                  |
| Knowledge document                | Supply facts, explanation, or reference                                                               | Informs cognition without owning an end-to-end procedure                             |
| Prompt or stored command          | Start or shape one invocation                                                                         | Need not be implicitly discoverable or reusable as a capability                      |
| Tool or MCP server                | Provide an action or observation primitive                                                            | Exposes capability but not the surrounding judgment and completion flow              |
| Script                            | Execute deterministic mechanics                                                                       | Cannot own the full contextual workflow                                              |
| Subagent                          | Configure a delegated actor, tools, or context                                                        | Defines an actor or isolation boundary rather than one reusable job                  |
| Hook                              | React automatically to a lifecycle event                                                              | Is event-driven rather than selected for a user goal                                 |
| Extension manager                 | Own canonical packages, manifests, projections, composition, installation, and distribution lifecycle | Manages the skill artifact without owning its workflow semantics                     |
| Extension pack                    | Declare a capability set and dependency graph for coordinated installation and lifecycle              | Is a composition contract, not itself the procedure                                  |
| Agent plugin                      | Distribute host-native capabilities in one host-specific container                                    | Is a host package boundary and is not interchangeable with an extension-manager pack |

## Selection rules

- Use a skill for one repeatable job with recognizable triggers and a coherent
  outcome.
- Use an agent definition when the durable artifact is an actor with a role,
  authority, tools, state, coordination, and stopping policy.
- Use an instruction for an invariant that must apply before the job is known.
- Use knowledge when the user needs understanding or lookup rather than a
  procedure.
- Use code when mechanics must be exact and cheaply testable.
- Use a subagent when separate context, authority, or actor specialization is
  the point.

Combining elements is normal. Incidental coupling—depending on whatever happens
to be installed on the author's machine—is not.

For AXM-specific package, pack, plugin-integration, and lifecycle behavior, read
the [AXM extension-management profile](platforms/axm.md).
