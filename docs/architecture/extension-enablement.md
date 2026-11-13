---
type: Architecture
status: stable
description: Responsibilities, boundaries, and shared principles for the surfaces that enable humans and agents to discover, use, and engineer agent extensions.
---

# Agent extension enablement architecture

This document defines how CLI behavior and discovery, the AXM skill, engineering collection, and
website work together to enable humans and agents to discover, use, and engineer
agent extensions. It governs their responsibilities and relationships; each
surface owns its detailed content and implementation.

These are behavior-shaping product surfaces. Changes can affect capability
discovery, action selection, authoring decisions, and verification across
consuming workspaces. A wording change that changes agent decisions is a
behavioral change and requires corresponding review and verification.

## Responsibilities and boundaries

| Surface                          | Responsibility                                                                                                                                                                                                          | Boundary                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI behavior and results         | Answer the requested question, enforce operational authority and ownership, preserve uncertainty, and report the actual effects, verdict, and bounded recovery.                                                         | Work without an AXM skill or a prescribed agent reading sequence. Conversational intent and actions taken through other tools remain outside the CLI's control.                                         |
| AXM skill                        | Recognize relevant requests and retain the conversational, direct-editor, and pre-tool boundaries the CLI cannot enforce. The skill is bundled with the CLI.                                                            | Each instruction needs evidence of a remaining need. Command recipes, output interpretation, and recovery mechanics belong to the CLI. Bundling does not imply automatic activation in every workspace. |
| CLI help and guidance            | Explain AXM's capabilities, behavior, standards, conventions, and supported workflows for the installed version. Provide sufficient guidance for ordinary use and basic authoring.                                      | Own AXM-specific correctness and conventions; leave deeper design judgment and pattern libraries to the engineering collection.                                                                         |
| Agent-extension-engineering pack | Provide optional, encouraged, opinionated guidance for designing, authoring, evaluating, and improving extensions. One routing skill selects knowledge containing the substantive principles, procedures, and patterns. | Complement AXM without becoming a prerequisite for using it or independently redefining its contracts. Distinguish engineering recommendations from product or external-standard requirements.          |
| Website docs                     | Own public discovery, onboarding, explanations, and learning journeys. Present relevant CLI reference, operational guidance, and engineering knowledge in a web-friendly form.                                          | Derivative material retains its source authority and stays synchronized with it. Website-specific teaching and navigation can be authored independently.                                                |

These are primary roles, not exclusive audiences: humans can read the
engineering knowledge, and agents can use the website before installing AXM.

## Shared principles

1. **One canonical owner for each claim.** Generate or reuse derivative material
   where practical; otherwise maintain explicit source links and consistency
   checks. Preserve the source's version and applicability when presenting it
   elsewhere. Website presentation does not create a competing contract.
2. **A complete core, with optional depth.** Installed CLI behavior, results, and
   discovery support ordinary use and basic authoring without the engineering
   pack. Optional engineering guidance adds authoring judgment; it does not
   repair gaps in the CLI's operational contract.
3. **Useful answers before instructions.** Default results expose ownership,
   effects, verdict, and uncertainty directly. Help explains choices and schema
   discovery explains fields when needed. Neither becomes a mandatory preflight
   sequence for an agent.
4. **Complete evidence with bounded repetition.** Shared declarations and
   repeated evidence have one canonical representation. Preserve consequential
   facts and exact requested content. Reference size budgets and task measurements
   guide representation changes; they do not authorize silent truncation.
5. **Reduction demonstrated through use.** Compare existing guidance, no-skill
   use, and the proposed minimal skill on isolated tasks, including held-out
   variations. Measure correctness, authority, loaded guidance, calls, and output
   volume separately. A shorter file alone does not establish independence.

## Shared vocabulary

The [Agent Extension Glossary](../../knowledge/agent-extension-engineering/src/glossary.md)
in `@agentxm/knowledge/agent-extension-engineering` owns shared term definitions.
Its reference authority is distinct from the collection’s opinionated engineering
guidance. The AgentXM Knowledge bundle owns deeper product explanations and naming
conventions; schemas and external standards retain their own contract authority.

The knowledge concept is the authoritative product glossary across repositories.
Keep definitions there rather than generating copies in CLI help, skills, or
website docs. Those surfaces link to the canonical glossary and use its terms
consistently. Ordinary CLI and skill use does not require the engineering pack.

Change definitions at their canonical owner, then review affected documentation
and product copy for consistency. Links establish discovery; reviewing term use
establishes semantic consistency.

## Application

Use this contract when changing these surfaces or their discovery,
distribution, or synchronization relationships. Maintainer instructions and
indexes link here; they do not duplicate the responsibility table. Detailed
[CLI help architecture](commands/help.md) specializes its own surface.

This document records accepted architectural intent, not evidence that every
existing artifact conforms. Executable product obligations retain their
[specification authority](../../specifications/catalog.md); alignment findings
and implementation verification remain separate evidence.
