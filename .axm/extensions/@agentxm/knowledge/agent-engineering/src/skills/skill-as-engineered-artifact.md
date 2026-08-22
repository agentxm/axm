---
type: Explanation
title: Skill as an engineered artifact
description: The contracts that make a skill more than a directory of instructions.
tags: [agent-skills, contracts, routing, workflow, trust, lifecycle]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Skill as an engineered artifact

An Agent Skill packages reusable procedural behavior behind a discoverable
route. Its directory is only the container; its engineering substance is a set
of contracts that can be inspected and tested.

| Contract     | Question                                                             | Typical owner                        |
| ------------ | -------------------------------------------------------------------- | ------------------------------------ |
| Routing      | When should this skill enter the task?                               | Name, description, invocation policy |
| Workflow     | What sequence, judgment, recovery, and checks apply?                 | `SKILL.md` body                      |
| Input/output | What is supplied, discovered, and produced?                          | Instructions and examples            |
| Capability   | Which tools, runtimes, references, assets, and scripts are required? | Package and host configuration       |
| Authority    | Which reads, writes, external actions, and approvals are permitted?  | Instructions and host policy         |
| Outcome      | What observable evidence establishes success?                        | Workflow and graders                 |
| Trust        | Why should these bytes, dependencies, and claims be believed?        | Provenance, integrity, review        |
| Lifecycle    | How does compatibility, change, rollback, and retirement work?       | Package and library operations       |

The portable format requires a `SKILL.md` with `name` and `description`, and
permits scripts, references, assets, and additional files.[^agent-skills-spec]
It does not make any contract correct merely by representing it.

## Consequence

A skill change is behavioral when it changes routing, authority, resource use,
failure handling, or outcomes—even if the diff is only prose. Treat metadata
and instructions with the same care as code that controls execution.

[^agent-skills-spec]: Agent Skills specification
