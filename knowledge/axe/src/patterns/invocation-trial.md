---
type: Pattern
title: "Invocation trial"
description: "Check which skill was selected, how it interpreted the request, and what work it performed."
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

## Check argument interpretation

Use a fixture with known identities and materially different outcomes. For
example, suppose a package auditor defaults to the current package, checks
links and metadata by default, and accepts repeated focus options. Make
`./store/checkout` current and give `./admin/checkout` the same short label.
These are example expectations for this auditor.

| Request                                                          | Expected interpretation                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/package audit ./admin/checkout --focus links`                  | Audit links in admin checkout and report findings.                          |
| “Check the admin checkout package for broken links.”             | Same operation, target, coverage, and read-only effect.                     |
| `/package audit`                                                 | Inspect the current store checkout package for both aspects.                |
| `/package audit ./missing`                                       | Report that the explicit path could not be resolved. No package is audited. |
| `/package audit checkout`                                        | Offer the two qualified packages and wait for the missing distinction.      |
| `/package audit ./admin/checkout --focus links --focus metadata` | Inspect both aspects on admin checkout.                                     |

Record the operation selected, target resolved, filters applied, and effect
requested. Compare those with the target actually inspected and the effect
observed. A report about the current package can look convincing even when
the caller supplied a different path. Keep skill selection as a separate
observation when comparing a named invocation with its paraphrase.

### Try a name shared by different extension types

Use a workspace with a skill, a knowledge bundle, and a pack all named
`docs`. Start with `$axe review docs`. Inspect the opening message and the
order of the tool calls. The agent may look up identities. It should present
all three qualified candidates and wait before naming one as the review
target or reading its contents.

Reply “the knowledge bundle.” Check that the agent resumes the review on that
exact identity without asking for the task again. In a fresh session, try
`$axe review the docs skill`. With one matching skill, it should proceed
directly. Record premature selection on the ambiguous case and unnecessary
clarification on the qualified case separately.

[^descriptions]: Agent Skills, testing descriptions against realistic requests.

[^trials]: AXM skill discovery and execution trials, archive review and rechecks.
