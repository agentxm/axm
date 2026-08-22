---
type: Reference
title: Prompt surfaces
description: How task prompts, tool descriptions, graders, handoffs, and multimodal instructions specialize the same craft.
tags: [system-prompt, tool-description, grader-prompt, handoff, multimodal, agent-prompts]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-tools
    resource: https://www.anthropic.com/engineering/writing-tools-for-agents
    title: Anthropic — Writing effective tools for AI agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: google-prompting
    resource: https://ai.google.dev/gemini-api/docs/prompting-strategies
    title: Google — Prompt design strategies
---

# Prompt surfaces

Prompt engineering applies anywhere authored language steers a model. Each
surface specializes the same contract while retaining a different owner.

| Surface                         | Prompt concern                                                                   | Neighboring owner                                             |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| System or developer instruction | Stable role, priorities, invariants, authority, response defaults                | Host and harness determine precedence and injection           |
| Task or stored prompt           | One goal, inputs, constraints, success, and output                               | Caller owns task authority and variable values                |
| Tool name and description       | Distinct purpose, selection boundary, parameter semantics, result and error use  | Tool implementation and policy remain harness concerns        |
| Grader prompt                   | Observable rubric, scale anchors, evidence use, and uncertainty                  | Evaluation system owns sampling, calibration, and aggregation |
| Agent handoff                   | Completed work, current state, unresolved questions, authority, and next outcome | Orchestrator owns actor selection and state transfer          |
| Generated prompt                | Meta-prompt input contract and validation of the generated artifact              | Generator workflow owns review and rollout                    |
| Multimodal prompt               | Explicit reference to each modality and its role                                 | Host owns encoding, limits, and supported modalities          |

Anthropic reports that tool descriptions and specifications materially steer
tool choice and parameter use, and recommends testing them with the same rigor
as other prompts.[^anthropic-tools] A grader prompt is also a prompt; its output
must be calibrated rather than treated as objective merely because it returns a
score.[^anthropic-evals]

Google recommends treating text, images, audio, and video as equal-class inputs
whose relationships are stated explicitly.[^google-prompting] Keep modality-
specific syntax in current host documentation rather than freezing it into a
portable rule.

[^anthropic-tools]: Anthropic — Writing effective tools for AI agents

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^google-prompting]: Google — Prompt design strategies
