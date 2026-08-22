---
type: How-to guide
title: How to admit a skill and assign ownership
description: How to decide whether a skill should enter or change the library and who accepts its continuing obligations.
tags: [agent-skills, admission, ownership, review, stewardship]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
sources:
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Skills for enterprise
  - id: github-codeowners
    resource: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
    title: GitHub — About code owners
  - id: dynamic-agent-skills
    resource: https://arxiv.org/abs/2607.10113
    title: Dynamic Agent Skills — A Lifecycle Survey and Taxonomy of Evolving Skill Libraries
---

# How to admit a skill and assign ownership

Admission asks whether an exact candidate should alter the governed library,
not merely whether its package is valid. Run it for a new skill and for a
material revision whose compatibility, risk, provenance, owner, or supported
environment changed.

## Admission flow

1. Bind the candidate digest, intended consumers, active cohorts, and requested
   lifecycle state.
2. Require a responsible team and escalation route to accept maintenance,
   incident, evaluation, deprecation, and migration obligations.
3. Compare the job and routing surface with current skills. Decide whether the
   need is new, belongs in an existing skill, warrants consolidation, or should
   remain a one-off workflow.
4. Classify risk and compute required automated gates and human reviewers.
5. Review structural validation, evaluation, coexistence, audit, provenance,
   compatibility, version, changelog, and migration evidence.
6. Record one disposition with conditions, unresolved evidence, expiry, and
   exact reviewers. Do not modify the candidate inside the decision.

Use `Admit experimental`, `Admit approved`, `Extend existing`, `Consolidate`,
`Revise`, `Reject`, or `Inconclusive`. A successful authoring smoke test is not
admission evidence. Anthropic recommends separation of duties and both isolated
and coexistence evaluation before production approval.[^anthropic-enterprise]

## Ownership contract

The operational owner is not necessarily the publisher. It is the team able to
judge the workflow and obligated to respond when it drifts. Require:

- one resolvable team rather than only an individual;
- a backup or escalation route;
- authority to approve ordinary changes and participate in incidents;
- named review and evidence-refresh expectations; and
- an orphan policy when the team dissolves or declines responsibility.

Use repository ownership and required review mechanics to route changes, while
protecting the ownership policy itself from unilateral edits.[^github-codeowners]
Automation may recommend owners from history; a team must explicitly accept.
Current lifecycle research treats verification and admission as distinct
stages whose quality determines library quality.[^dynamic-agent-skills]

[^anthropic-enterprise]: Anthropic — Skills for enterprise

[^github-codeowners]: GitHub — About code owners

[^dynamic-agent-skills]: Dynamic Agent Skills — A Lifecycle Survey and Taxonomy of Evolving Skill Libraries
