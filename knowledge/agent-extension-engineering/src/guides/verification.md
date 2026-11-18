---
type: Guide
title: "Verifying extension behavior"
description: "Choose evidence for a claim about packaging, routing, runtime behavior, portability, or improvement."
tags: ["evaluation", "tests", "routing", "smoke", "evidence", "portability"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:42:23Z" }
sources:
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

Use an [invocation trial](../patterns/invocation-trial.md) to compare discovery
with explicit selection. If a version-specific convention is easy to overlook,
also try a short scoped pointer to the same guidance.

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

[^eval]: OpenAI, Testing Agent Skills Systematically with Evals.
