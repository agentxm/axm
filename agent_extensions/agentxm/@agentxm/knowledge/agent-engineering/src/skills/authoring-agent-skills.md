---
type: How-to guide
title: How to author an Agent Skill
description: How to turn defined requirements or workflow evidence into a bounded portable Agent Skill with precise routing, proportional instructions and resources, and observable validation.
tags: [agent-skills, authoring, routing, workflow, authority, validation]
status: stable
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
generated: { by: "codex/gpt-5.6", at: 2026-08-27T03:10:49Z }
stale_after: 2027-02-21
---

# How to author an Agent Skill

Use this guide to create one portable Agent Skill from defined requirements or
concrete workflow evidence. For a change to an existing skill, use
[How to maintain and evolve a skill](maintenance-and-evolution.md); for deciding
whether an observed workflow warrants a reusable package, use
[How to select a skill candidate](candidate-selection.md).

## Goal

Produce a canonical skill package whose job, routing, authority, resources,
failure behavior, completion evidence, and supported environments are clear and
whose observable behavior has been checked in proportion to its risk.

## Preconditions

- A user-requested capability or observed workflow with a coherent outcome
- A resolved target host and canonical package location
- Authority to create the package, distinct from authority to install, publish,
  approve, or perform the packaged workflow's external side effects

## Author the skill

1. **Bind the requested job.** Preserve the user's chosen product, tool,
   deliverable, and scope. State when the job starts, what evidence establishes
   success, and what adjacent work it does not own. Split unrelated triggers or
   outcomes instead of hiding several jobs behind one description.
2. **Choose the right element.** Confirm that reusable procedural judgment is
   needed and that an instruction, knowledge document, prompt, tool, script,
   subagent, or hook does not better own the responsibility. Use
   [Skill boundaries and neighboring elements](skill-boundaries-and-neighboring-elements.md)
   for ambiguous cases.
3. **Write the routing contract.** Lead with the capability and include terms
   that appear in realistic requests. Add an exclusion only when a plausible
   neighboring task would otherwise over-match. Keep model-facing routing
   metadata distinct from human-facing registry prose; see
   [Routing and activation](routing-and-activation.md).
4. **Define only the applicable workflow contracts.** Resolve the inputs,
   discoverable facts, decisions, output, authority, failures, and completion
   evidence that change execution. Use goals and decision criteria where
   several approaches are valid, ordered steps where dependencies matter, and
   exact templates or scripts only for fragile mechanics. Distinguish actual
   requirements from recommendations, examples, and local conventions. See
   [Workflow contracts](workflow-contracts.md) and
   [Degrees of freedom](degrees-of-freedom.md).
5. **Choose the smallest useful package.** Keep routing and essential
   constraints in `SKILL.md`; add only resources that concretely improve
   execution, and route to conditional resources where needed. Apply
   [Progressive disclosure for skills](progressive-disclosure-for-skills.md)
   and [References, scripts, and assets](resources-scripts-and-assets.md),
   including its generated-file and distribution-boundary guidance.
6. **Design interaction only when the job has one.** For a meaningful
   user-facing sequence, apply
   [How to design agent-mediated user experience](../agents/agent-mediated-user-experience.md).
   Add [Decision-support presentations](decision-support-presentations.md) when
   the workflow compares alternatives, recommends one, or leaves a
   consequential choice with a person. Do not add questions, progress, or
   confirmations to a one-step or non-interactive job merely for consistency.
7. **Adapt through independent layers.** Keep the portable contract
   authoritative. Open a host profile under
   [Host and extension-management profiles](platforms/) only for a host the
   skill explicitly supports. When AXM owns the package, also read the
   [AXM extension-management profile](platforms/axm.md) and current CLI help;
   manager selection does not imply a host claim. Keep optional UI, invocation,
   or distribution metadata consistent with the portable skill without making
   it the sole source of behavior.
8. **Author canonically.** Use the repository's extension manager or host
   scaffold, preserve unrelated supported metadata and invocation policy, and
   reference only portable package paths or declared pack siblings.
9. **Validate proportionately.** Validate package structure, changed helpers,
   applicable consumer-worktree protections, and release contents. Exercise
   clear and paraphrased positives plus a likely adjacent negative for routing
   changes. Exercise the happy path, relevant failures, authority boundaries,
   and observable output for execution changes. Use independent isolated
   forward-testing only when complexity or consequence justifies it; grade
   artifacts and behavior rather than wording.
10. **Hand off established evidence.** Report the canonical identity, files
    changed, checks performed, public-contract or authority deltas, assumptions,
    and remaining evaluation, audit, migration, or release work. Authoring
    evidence does not independently approve the skill.

## Greenfield requests

Repeated observations are strong candidate evidence, but an explicit request
may commission a new skill before usage history exists. Proceed when the job,
authority, environment, and observable outcome can be stated without inventing
private facts. Mark unsupported assumptions, use synthetic representative
cases, and treat compatibility or production-readiness claims as unverified.
Defer when the request remains only a topic or aspiration without a coherent
workflow contract.

## Stop conditions

Stop and return the preserved state when required authority, canonical source,
host capability, or material input is unavailable. Bound retries for external
or mutating operations and do not interpret skill activation as permission to
expand scope, install, publish, or perform unrelated effects.
