---
type: Explanation
title: The Gen Stack method
description: How one software-change method connects intent, authoritative Requirements, architecture, realization, evaluations, and operational feedback while preserving the distinct authority of each layer.
tags: [generative-stack, software-change, requirements, architecture, evaluations, feedback]
sources:
  - id: fowler-generative-stack
    resource: https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/
    title: Chad Fowler — The Generative Stack
---

# The Gen Stack method

Gen Stack treats software change as a connected system of intent,
representations, realization, evidence, and learning:

```text
signal or request
      ↓
work item and Requirement impact
      ↓
accepted Requirement authority
      ↓
architecture response and implementation
      ↓
evaluation definitions → executions → results
      ↓
operational observations and human judgment
      └───────────────────────────────↺
```

The loop is inspired by Chad Fowler's account of a generative stack that moves
from human intent through structured clauses, evaluations, implementation, and
runtime feedback, with overlapping representations and explicit composition
points between layers.[^fowler-generative-stack] This bundle adapts that
direction into a practical software-change method with explicit authority
boundaries.

The arrows do not transfer authority automatically. A request is not an
accepted Requirement. A Requirement is not its architecture response. A test
is not the Requirement it evaluates. A production observation is not changed
intent. Each transition needs the authority and judgment appropriate to the
kind of change.

## What the method optimizes for

- Preserve a single normative authority for each accepted obligation.
- Permit useful, diverse redundancy among representations with different
  purposes and failure modes.
- Make changes traceable from originating signal through desired state,
  realization, and evidence without requiring one universal document or
  traceability matrix.
- Keep contradiction, uncertainty, and unavailable evidence visible until an
  authorized decision resolves them.
- Let fast-changing implementation layers remain replaceable while conserving
  data, contracts, Requirements, operational memory, and rollback paths.
- Compact obsolete structure and explanations after learning has stabilized.

## Boundaries

Gen Stack does not choose product priority, accept Requirements, approve
architecture, implement evaluator infrastructure, or authorize production
release. It supplies a shared method for keeping those decisions and artifacts
coherent. It also does not require every implementation-local test to map to a
maintained Requirement; only an evaluation that claims Requirement coverage
needs the stable relationship.

The method is deliberately opinionated but not a claim that fully autonomous
regenerative software is mature. Use the [adoption
ladder](design-and-change/gen-stack-adoption-ladder.md) and take only the next
step supported by current needs and evidence.

[^fowler-generative-stack]: Fowler describes the motivating layered pipeline,
    overlapping representations, and feedback direction. “One authority, many
    witnesses” and the lifecycle contracts in this bundle are this package's
    synthesis.
