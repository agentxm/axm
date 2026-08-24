---
type: Explanation
title: Agent Skill lifecycle
description: The evidence and decisions from candidate observation through retirement.
tags: [agent-skills, lifecycle, maintenance, distribution, retirement]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: dynamic-agent-skills
    resource: https://arxiv.org/abs/2607.10113
    title: Dynamic Agent Skills — A Lifecycle Survey and Taxonomy of Evolving Skill Libraries
---

# Agent Skill lifecycle

Skill engineering continues after a package validates. Each stage consumes
evidence and creates obligations for later stages.

| Stage      | Entry evidence                                             | Main decision or work                     | Exit evidence                             |
| ---------- | ---------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| Observe    | Repeated work, friction, failures, successful trajectories | Is a reusable pattern present?            | Concrete positive and negative examples   |
| Select     | Examples and neighboring capabilities                      | Does this warrant a skill?                | Bounded candidate or rejection rationale  |
| Design     | Candidate, hosts, authority, outcomes                      | Which contracts and resources are needed? | Skill design and case matrix              |
| Author     | Accepted boundaries and local package rules                | Encode the portable workflow              | Canonical package and smoke evidence      |
| Validate   | Package bytes and host rules                               | Is the package structurally usable?       | Validator and helper results              |
| Evaluate   | Target identity, cases, graders, baselines                 | Does routing and execution work?          | Behavioral report and raw evidence        |
| Audit      | Exact bytes, provenance, intended trust scope              | Is installation or release acceptable?    | Findings and recommendation               |
| Distribute | Accepted package, metadata, license, integrity             | Who can install which version?            | Published immutable identity              |
| Operate    | Usage, failures, drift, dependency changes                 | Maintain, evolve, constrain, or retire?   | Revised evidence, deprecation, or removal |

The table describes available lifecycle responsibilities, not mandatory
ceremony for every edit. Match depth to the requested outcome, changed
contract, consequence, and evidence claim. A narrow local correction may need
structural validation and affected regressions; independent evaluation, audit,
admission, or release work applies when requested or when the changed trust or
distribution surface genuinely requires it.

Governed libraries add explicit states: `candidate`, `experimental`,
`approved`, `deprecated`, `revoked`, and `retired`. Publication and installation
do not imply approval. Decisions bind to an exact artifact, intended cohort,
and effective capability policy.

Governance states do not themselves change registry availability or installed
state. Apply the extension manager's native deprecation, availability,
activation, and removal controls needed to realize the decision. For AXM, see
the [AXM extension-management profile](platforms/axm.md).

## Feedback without self-approval

Evaluation and audit should route evidence back to authoring, not silently
repair and approve the same artifact in one opaque step. Separation makes the
change, its motivation, and its new evidence visible.

## Portfolio lifecycle

At library scale, admission, retrieval, composition, repair, provenance, and
rollback become first-class concerns.[^dynamic-agent-skills] A good individual
skill can still reduce the whole library's quality by colliding with another
route or consuming attention without producing utility.

Re-enter admission when a change expands authority, changes provenance or
ownership, invalidates compatibility, alters material dependencies, or targets
a new consequential environment. Re-evaluate when host or model drift changes
behavior even if package bytes remain unchanged.

[^dynamic-agent-skills]: Dynamic Agent Skills — A Lifecycle Survey and Taxonomy of Evolving Skill Libraries
