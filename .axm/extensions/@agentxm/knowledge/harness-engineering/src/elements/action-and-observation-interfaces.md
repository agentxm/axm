---
type: Explanation
title: Action and observation interfaces
description: How harness interfaces expose useful capabilities and legible environmental state to an agent, and how they render questions and choices to a person.
tags: [harness, tools, interfaces, actions, observations, errors, human-interaction]
status: stable
sources:
  - id: anthropic-tool-writing
    resource: https://www.anthropic.com/engineering/writing-tools-for-agents
    title: Anthropic — Writing tools for agents
generated:
  by: claude-code/claude-opus-5
  at: 2026-08-16T01:39:08Z
stale_after: 2027-02-14
---

# Action and observation interfaces

A harness mediates between model decisions and environmental effects through
interfaces. An action interface exposes what the agent can do; an observation
interface renders state and consequences in a form the agent can use.

The harness owns interface implementation, authorization, execution, and
result validation. Agent engineering owns the behavioral policy for when and
why a capability should be selected, what evidence should precede a
consequential action, and how the result changes the next decision.

Good interfaces form a closed loop:

```text
inspect state → choose action → execute → observe consequence → decide again
```

Each tool should have a distinct purpose, compact and unambiguous inputs,
bounded effects, and results that expose the identifiers and state needed for
the next decision. Errors should distinguish invalid requests, denied
authority, environmental failure, and partial completion, then identify a safe
recovery path.[^anthropic-tool-writing]

Interface quality is systemic. A perfect schema does not help if the runtime
hides relevant state, truncates the decisive output, or reports success before
an effect is durable. Evaluate the full loop on representative tasks, including
failure and retry paths.

## Human interaction surfaces

Some harnesses expose a third interface: a way to put a question, a choice, or
an approval in front of a person and carry the answer back. It is an interface
like any other, with a schema, limits, and failure modes, and the harness owns
its rendering.

A harness usually offers at least two surfaces for the same purpose — ordinary
assistant output, and a structured affordance for questions, choices, or
confirmations — and they are not interchangeable. A structured affordance
typically supplies its own item labels, bounds how many items it accepts,
truncates long item bodies, and may be unavailable in non-interactive,
headless, or scheduled runs. Assistant output carries unbounded detail but
offers no guarantee that a reply arrives in a parseable form.

Two consequences follow:

- **Rendering is not the agent's to assume.** An affordance that renumbers
  items overrides labels the agent wrote. Where both a rendered affordance and
  written text describe one decision, the harness decides what the person
  actually sees.
- **Surface selection is behavioral policy.** Which surface carries a given
  interaction, and what happens when the preferred one is absent, belongs to
  the agent, skill, or workflow layer — not to the interface. Left unstated, it
  is decided per turn, and equivalent interactions render inconsistently.

Evaluate these surfaces on the hosts a system claims, including a run where no
structured affordance exists.

[^anthropic-tool-writing]: Anthropic — Writing tools for agents
