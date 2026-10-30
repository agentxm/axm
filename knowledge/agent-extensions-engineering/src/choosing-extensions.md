---
type: Guide
title: "Choosing extension boundaries"
description: "Use when deciding how to extend an agent; choose the smallest extension types that own the required behavior."
tags: ["extensions", "boundaries", "design", "skills", "rules", "packs"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Choosing extension boundaries

Start with the user's intended outcome, the consuming host, and the observable
completion evidence. An extension changes an existing agent's capabilities or
context. Designing the agent's autonomous runtime, planning loop, memory system,
or multi-agent orchestration is outside this collection.

## Choose by responsibility

| Need                                                           | Owning surface               |
| -------------------------------------------------------------- | ---------------------------- |
| On-demand procedural judgment                                  | Skill                        |
| Persistent constraints at a defined scope                      | Instructions or rules        |
| Facts, explanations, reference, and detailed guidance          | Knowledge bundle             |
| A delegated role with its own host-supported tools and context | Agent definition             |
| Deterministic behavior at a host lifecycle event               | Hook                         |
| Access to an existing tool service                             | MCP connection configuration |
| A required, installable group of extensions                    | Pack                         |

A prompt is content within one of these surfaces when it serves that surface's
job. A tool implementation belongs to software engineering. Installing an MCP
connection does not implement its server. Avoid creating a new abstraction when
an adopted host or manager already supplies the required capability.

## Establish the contract

Record the triggering request, intended users, inputs, outputs, supported host,
authority, dependencies, side effects, failure recovery, and completion evidence.
Mark unknown host behavior as unknown. Keep required relationships distinct from
extensions that merely happen to be installed together.

Split responsibilities when they have different activation conditions or
owners. Combine a small routing skill with knowledge when several related uses
share a body of guidance: the skill selects the relevant concepts; the knowledge
owns the substance. Do not duplicate procedures in both.

Finish with an explicit choice and its reason, a canonical owner for each
surface, and the next relevant [authoring route](index.md).
