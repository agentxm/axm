---
type: Guide
title: "Verifying extension behavior"
description: "Choose evidence for a claim about packaging, routing, runtime behavior, portability, or improvement."
tags: ["evaluation", "tests", "routing", "smoke", "evidence", "portability"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: creator
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/skill-creator/SKILL.md
    title: Anthropic skill creator
  - id: eval
    resource: https://developers.openai.com/blog/eval-skills
    title: OpenAI skill evaluation guide
---

# Verifying extension behavior

| Claim                             | What to inspect or exercise                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| The package is valid              | Applicable schema and format checks                                                   |
| The archive is complete           | Required resources in the exact archive                                               |
| The host received the extension   | The selected host's projection                                                        |
| Requests reach the intended skill | Observed selection for direct requests, paraphrases, and a plausible neighboring task |
| The workflow works                | The result of a representative task and any failure path the claim covers             |
| The change improves results       | The same tasks with the candidate and a prior, smaller, or absent extension           |
| The behavior is portable          | The claimed behavior in each supported host                                           |

Choose cases from the extension's promise. For this pack's router, “review this
skill” and “fix this skill” should both reach the relevant craft guidance, but
only the second asks for an edit. For a glossary router, try a definition request
and a request to perform the action being defined.

For a comparison, hold the host, model, inputs, and available tools steady.
Keep fresh cases for evaluation and repeat trials where selection varies.
Record the revision and observed output. A shorter route can save tokens while
producing a worse answer, so assess cost and task quality separately.

Run the same request in fresh contexts with the skill available for ordinary
discovery and with it explicitly supplied.[^creator] If a version-specific
convention is easy to overlook, add a third run with a short scoped pointer
to the same guidance. Record the route observed, the material opened, and
whether the delivered artifact satisfies the convention. Supplying guidance
tests whether the agent can apply it. An ordinary request also tests whether
the agent finds it. Record unknowns when the host does not expose a read.

Choose observable checks for the outcome, required process, presentation, and
cost as applicable.[^eval] For a review, the correct finding and an accurate
repair location are output evidence. Tool traces show how the reviewer got
there. Report both when two routes produce the same finding at different costs.

To exercise an extension reviewer, vary what it can actually inspect. Give it
the same request in three fresh contexts: “Check whether this skill's
migration guide is available to a consumer.”

| Material supplied                                  | Expected review outcome                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A complete archive with a link to a missing guide  | Identify the broken reference and the workflow it blocks.                                           |
| The same archive with the guide at the linked path | Report that the reference resolves. A clean result can close the review.                            |
| Only the excerpt containing the link               | Leave availability unresolved and identify the archive or its file listing as the missing evidence. |

Record how the workflow went alongside the verdict. A reviewer might reach
the right finding after opening three unrelated concepts. Capture the extra
lookups and what prompted them as trial observations. If the detour recurs,
try a more specific route or retain the case for the next comparison.

[^creator]: Anthropic skill creator, trigger evaluation and output comparison.

[^eval]: OpenAI, Testing Agent Skills Systematically with Evals.
