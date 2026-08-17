---
type: Reference
title: Routing evaluations
description: Cases and metrics for implicit selection, rejection, ambiguity, and catalog collisions.
tags: [agent-skills, evaluation, routing, activation]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
---

# Routing evaluations

Test routing with the same discovery surface the host exposes, usually only the
name and description. Do not reveal the skill body or expected answer. Explicit
invocation is a control case, not evidence that implicit routing works. OpenAI
documents both explicit and implicit invocation surfaces.[^openai-build-skills]

## Minimum matrix

For every important trigger family, include:

- clear and paraphrased positives;
- adjacent negatives that share vocabulary but not responsibility;
- ambiguous requests where clarification or abstention is appropriate;
- catalog-collision cases with plausible neighboring skills; and
- explicit invocation to distinguish routing from execution failure.

Record the selected skill or abstention, alternatives exposed by the host, and
whether selection occurred before task-specific evidence was available. Report
misses and false positives separately; improving recall by selecting for nearly
everything is not progress.

Compare revisions against an unchanged case set, but add a regression case for
every confirmed routing failure. Keep cases natural: keyword mirrors can reward
metadata stuffing rather than useful recognition.

[^openai-build-skills]: OpenAI — Build skills
