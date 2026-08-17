---
type: How-to guide
title: How to select a skill candidate
description: How to decide whether repeated work warrants a reusable Agent Skill.
tags: [agent-skills, candidate-selection, workflow, repetition, scope]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
---

# How to select a skill candidate

Create a skill when reusable procedural knowledge materially improves repeated
work. Do not create one merely because a task can be described in Markdown.

## Evidence to gather

- Concrete successful and failed examples
- Information or corrections repeatedly supplied by a user
- Repeated tool sequences, judgment, recovery, or verification
- Recognizable start and completion conditions
- Adjacent tasks the workflow should not own
- Intended users, hosts, environments, and authority

## Candidate test

A strong candidate answers yes to most of these questions:

1. Does substantially similar work recur?
2. Does reusable context, sequencing, or judgment improve the outcome?
3. Can a caller or agent recognize when the job starts?
4. Is there an observable result or completion condition?
5. Can neighboring work be excluded without a long exception list?
6. Can the package travel without private incidental dependencies?
7. Is a skill better than an instruction, knowledge document, tool, or script?

## Reject or defer when

- the workflow is hypothetical and unobserved;
- one obvious tool call already owns the whole job;
- the content is primarily facts or explanation;
- the rule must apply to every task before routing;
- unrelated triggers or outcomes are bundled under a department-sized label; or
- required authority, environment, or outcome cannot yet be stated.

Deferral is useful evidence: observe the work until the missing pattern becomes
clear instead of encoding assumptions as reusable behavior.
