---
okf_version: "0.2"
---

# Prompt engineering knowledge

Portable practices for engineering intentional model-facing instructions as
testable, versioned artifacts. Use this bundle for prompt content and response
contracts across task prompts, tools, graders, handoffs, and other invocation
surfaces; use context engineering for the wider information lifecycle and
agent engineering for goal-directed behavior, and harness engineering for
runtime implementation and enforcement.

## Begin with ownership

- [Prompt engineering foundations](foundations/) - The prompt artifact, its engineering lifecycle,
  and its boundaries from agent, context, harness, skill, and evaluation
  engineering.

## Design model-facing contracts

- [Prompt design](design/) - Prompt contracts, instruction structure, examples,
  templates, response presentations, and distinct prompt-bearing surfaces.

## Establish evidence and evolve

- [Prompt evaluation and operations](operations/) - Prompt-specific ablation,
  robustness, versioning, and compatibility across models and hosts.

## Preserve trust boundaries

- [Prompt trust](trust/) - Prompt-injection-aware composition and the limits of
  probabilistic instructions as security controls.

## Diagnose the responsible surface

- [Failure routing](failure-routing.md) - How to distinguish prompt defects from agent, context, harness, skill, model, workflow, or deterministic-contract defects.
