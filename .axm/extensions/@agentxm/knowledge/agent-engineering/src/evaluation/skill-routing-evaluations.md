---
type: Reference
title: Routing evaluations
description: Cases, trigger-rate measurement, and holdout discipline for implicit selection, rejection, ambiguity, and catalog collisions.
tags: [agent-skills, evaluation, routing, activation, trigger-rate, holdout, case-realism]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-22T22:33:39Z }
stale_after: 2027-02-22
sources:
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
  - id: anthropic-skill-creator-run-loop
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/run_loop.py
    title: Anthropic — Skill Creator description optimization loop
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

A catalog neighbor tests selection and coexistence; its presence does not imply
that either package must invoke, defer to, compose with, or depend on the other.
Test ordered composition only when a declared package relationship, host
contract, or supplied workflow independently requires it. When a collision is
real, attribute it to the smallest responsible description, catalog policy, or
composition contract instead of manufacturing a cross-package dependency.

Compare revisions against an unchanged case set, but add a regression case for
every confirmed routing failure.

## Measure a rate, not a verdict

Selection is a model judgment and varies between attempts on identical input.
Run each case several times under fixed conditions, record the fraction of
attempts that selected the skill, and compare that fraction with a declared
threshold. Anthropic's Skill Creator samples each query repeatedly and scores it
by the resulting trigger rate rather than by one attempt.[^anthropic-skill-creator]

Report the rate, not only the disposition. A positive that selects on slightly
more than half of attempts and one that selects every time both pass a
majority threshold, and they are not the same routing contract.

## Size cases so selection can vary

A host consults a skill for work the assistant cannot already complete
directly, so a request it satisfies unaided may go unselected however precise
the description is.[^anthropic-skill-creator] A trivially easy case therefore
measures task difficulty rather than routing, and it misleads in both
directions: the positive records a miss no description can repair, and the
negative passes without exercising any boundary.

Write each case at a difficulty where consulting the skill is a plausible
benefit. When the intended cohort genuinely includes one-step requests, record
that the host may not route them at all and state it as an exclusion rather
than widening the description until it does.

## Keep cases recognizable as real requests

A routing case samples the request distribution, so write it as the intended
user would actually type it: real file names, paths, fields, tools, and enough
situational detail to make the job legible. Vary register and length across the
set — formal and hurried, careful and casual, some lowercase, abbreviated, or
mistyped. Include requests that need the skill without naming its subject,
artifact, or file type.

Negatives carry most of the information, and only near misses carry any. A
negative sharing no vocabulary with the skill tests nothing. A negative that
shares vocabulary but belongs to a neighbor tests the boundary that actually
fails in deployment. Keyword mirrors reward metadata stuffing rather than
useful recognition.

## Hold out cases before tuning a description

A description revised until the suite passes has made that suite an
optimization target, and its score then reports fit to the cases that shaped
it. Anthropic's Skill Creator splits the query set stratified by expected
outcome and selects the winning description by held-out score rather than
tuning score.[^anthropic-skill-creator-run-loop]

Whenever a description is iterated against measured results:

- split cases into a tuning set and a held-out decision set before the first
  revision;
- stratify the split so both sets retain positives and negatives;
- report the held-out rate as the result and the tuning rate as diagnostic; and
- treat a held-out case as spent once it has been inspected in detail, because
  reading why it failed converts it into a tuning case.

This is the routing instance of the general separation between development and
decision cases in
[Task distributions and case suites](task-distributions-and-case-suites.md).

[^openai-build-skills]: OpenAI — Build skills
[^anthropic-skill-creator]: Anthropic — Skill Creator
[^anthropic-skill-creator-run-loop]: Anthropic — Skill Creator description optimization loop
