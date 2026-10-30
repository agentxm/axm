---
type: Architecture
status: stable
description: Responsibilities, boundaries, and shared principles for the surfaces that enable humans and agents to discover, use, and engineer agent extensions.
---

# Agent extension enablement architecture

This document defines how the AXM skill, CLI help, engineering collection, and
website work together to enable humans and agents to discover, use, and engineer
agent extensions. It governs their responsibilities and relationships; each
surface owns its detailed content and implementation.

These are behavior-shaping product surfaces. Changes can affect capability
discovery, action selection, authoring decisions, and verification across
consuming workspaces. A wording change that changes agent decisions is a
behavioral change and requires corresponding review and verification.

## Responsibilities and boundaries

| Surface                          | Responsibility                                                                                                                                                                                                          | Boundary                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AXM skill                        | Reliably recognize relevant agent requests, orient the agent, discover CLI capabilities, and supply essential instructions for correct use. The skill is bundled with the CLI.                                          | Keep detailed operational reference in CLI help and extensive authoring guidance in the engineering collection. Bundling does not imply automatic activation in every workspace.               |
| CLI help and guidance            | Explain AXM's capabilities, behavior, standards, conventions, and supported workflows for the installed version. Provide sufficient guidance for ordinary use and basic authoring.                                      | Own AXM-specific correctness and conventions; leave deeper design judgment and pattern libraries to the engineering collection.                                                                |
| Agent-extension-engineering pack | Provide optional, encouraged, opinionated guidance for designing, authoring, evaluating, and improving extensions. One routing skill selects knowledge containing the substantive principles, procedures, and patterns. | Complement AXM without becoming a prerequisite for using it or independently redefining its contracts. Distinguish engineering recommendations from product or external-standard requirements. |
| Website docs                     | Own public discovery, onboarding, explanations, and learning journeys. Present relevant CLI reference, operational guidance, and engineering knowledge in a web-friendly form.                                          | Derivative material retains its source authority and stays synchronized with it. Website-specific teaching and navigation can be authored independently.                                       |

These are primary roles, not exclusive audiences: humans can read the
engineering knowledge, and agents can use the website before installing AXM.

## Shared principles

1. **One canonical owner for each claim.** Generate or reuse derivative material
   where practical; otherwise maintain explicit source links and consistency
   checks. Preserve the source's version and applicability when presenting it
   elsewhere. Website presentation does not create a competing contract.
2. **A complete core, with optional depth.** AXM's skill and CLI guidance support
   successful use and basic authoring without the engineering pack. The pack
   adds stronger authoring judgment, and the website makes both accessible.

## Application

Use this contract when changing any of the four surfaces or their discovery,
distribution, or synchronization relationships. Maintainer instructions and
indexes link here; they do not duplicate the responsibility table. Detailed
[CLI help architecture](commands/help.md) specializes its own surface.

This document records accepted architectural intent, not evidence that every
existing artifact conforms. Executable product obligations retain their
[specification authority](../../specifications/catalog.md); alignment findings
and implementation verification remain separate evidence.
