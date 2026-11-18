---
type: Pattern
title: "Invocation trial"
description: "When a skill misses a task or appears on the wrong one, observe selection and task outcome separately."
tags:
  ["skills", "evaluation", "explicit invocation", "implicit invocation", "paraphrase", "near miss"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:42:23Z" }
sources:
  - id: descriptions
    resource: https://agentskills.io/skill-creation/optimizing-descriptions
    title: Agent Skills description evaluation
  - id: trials
    resource: https://github.com/agentxm/axm/blob/2505849d1a39fc57b2ed01e0f1a5af2bcf91d0fe/skills/agent-extension-engineering/evals/2026-11-18/README.md
    title: AXM discovery and execution trials
---

# Invocation trial

State the supported [invocation policy](invocation-policy.md) and the result
a consumer should receive. Suppose an archive reviewer checks whether packaged
references resolve and supports both entry points. Try these requests in fresh sessions with the same host, model,
tools, artifact, and skill revision.[^descriptions]

| Request                                                                        | Question it answers                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Explicitly select the skill and ask for an archive review.                     | Can the named entry point complete the review?                                  |
| Ask for that review without naming the skill.                                  | Does ordinary discovery reach it?                                               |
| Paraphrase it, for example “Will the link work for someone who installs this?” | Does the route survive a change of wording?                                     |
| Ask where to edit the guide that the archive contains.                         | Does the agent leave the archive reviewer idle or select an ownership workflow? |

Set the expected route for each request before the run. For explicit-only or
model-only designs, include the restricted entry point and check the host's
promised behavior there. Supplying the guide body directly can isolate
execution when discovery is uncertain.

Record the prompt, host and revision, observed skill selection, resources
opened, and the outcome for the user. Mark a read as unknown if the host does
not expose it. A correct answer with no observed selection can be good work
while leaving invocation unproven. Repeat fresh cases before drawing a
conclusion about reliability.

In the pack’s [review trials](https://github.com/agentxm/axm/blob/2505849d1a39fc57b2ed01e0f1a5af2bcf91d0fe/skills/agent-extension-engineering/evals/2026-11-18/README.md#review-a-migration-guide-reference),
both explicit and ordinary requests reached the correct conclusions for a
broken reference, a healthy one, and an excerpt. An extra lookup appeared in
each run. After the router gained a stopping condition, the three ordinary
rechecks reached the same conclusions with one concept lookup apiece.[^trials]
Those fixtures exercised selection and execution on one host.

[^descriptions]: Agent Skills, testing descriptions against realistic requests.

[^trials]: AXM skill discovery and execution trials, archive review and rechecks.
