---
type: Guide
title: "Choosing extension boundaries"
description: "Choose an extension type based on when and where the behavior should apply."
tags: ["extensions", "boundaries", "design", "skills", "rules", "packs"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:42:23Z" }
---

# Choosing extension boundaries

Start with a task the agent should handle differently. If an existing command
already does the work, a link from the place where people need it may suffice.

| When is it needed?                                            | What to author                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| On every task in a particular scope                           | [Scoped instructions](../patterns/scoped-instructions.md), or a rule when workspaces should share it |
| When a request or recognized work phase calls for a procedure | A skill for the decisions and procedure                                                              |
| When a question calls for domain facts or detailed guidance   | A knowledge concept                                                                                  |
| When another role needs its own context or tools              | An agent definition                                                                                  |
| At a host event, even if the agent never asks                 | A hook                                                                                               |
| When the agent needs tools from an existing service           | An MCP connection                                                                                    |
| When consumers need several extensions installed together     | A pack                                                                                               |

Timing can determine the mechanism. An agent approaching a completion claim can
select a verification skill using a [workflow-phase cue](../patterns/trigger-cues.md).
If a check must run after each matching tool action, use a [hook](configuring-hooks-and-mcp.md)
at an event the host exposes. A convention needed throughout work in one
package belongs in [scoped instructions](../patterns/scoped-instructions.md).

For example, a repository may require a generated file to match its source.
Let a check enforce the match. A short instruction naming the source helps an
agent editing nearby. Add a repair skill only if diagnosing a mismatch takes
judgment that the check's output cannot supply.
