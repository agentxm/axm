---
type: Explanation
title: Feedback and verification
description: How harnesses turn action consequences into useful feedback and establish completion with evidence.
tags: [harness, feedback, verification, evidence, observability, completion]
status: stable
sources:
  - id: openai-harness-engineering
    resource: https://openai.com/index/harness-engineering/
    title: OpenAI — Harness engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T22:24:33Z
stale_after: 2027-02-14
---

# Feedback and verification

Feedback tells an agent what happened after an action. Verification establishes
whether a required property or outcome holds. A useful harness supplies both:
fast signals for steering and objective evidence for completion.

The harness owns producing, structuring, and retaining mechanical signals. The
agent's behavioral design owns how evidence causes reflection, replanning,
retry, fallback, escalation, or termination. Context engineering owns how the
feedback is selected and represented when it re-enters model attention.

Prefer executable feedback where a system can decide the result. Return the
failed condition, affected artifact, relevant evidence, and recovery route.
Avoid undifferentiated logs and success messages that do not prove the claimed
effect. Preserve artifacts when later review or audit depends on them.

Completion criteria should be defined before the agent declares success and
should match the consequence of the work. Tests, schemas, policy checks,
runtime observations, and human decisions cover different claims; no single
signal substitutes for all of them. OpenAI's harness account emphasizes giving
agents observable environments and feedback loops that let them verify their
own work.[^openai-harness-engineering]

[^openai-harness-engineering]: OpenAI — Harness engineering
