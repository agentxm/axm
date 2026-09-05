---
type: Guide
title: Eliciting and inventorying requirement sources
description: Guides source discovery and elicitation while preserving provenance, uncertainty, and stakeholder differences.
tags: [elicitation, sources, stakeholders, provenance, uncertainty]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Eliciting and inventorying requirement sources

Begin with the decision and system boundary, not a blank requirement template.
Inventory sources that may impose needs or constraints:

- affected users, operators, maintainers, customers, sponsors, and decision
  authorities;
- business goals, policies, contracts, laws, standards, and safety obligations;
- current behavior, incidents, support evidence, research, analytics, and known
  workarounds;
- interfaces, dependencies, operating environments, data, and lifecycle events;
- prior requirements, accepted decisions, designs, and explicit assumptions.

For each source, record identity, version or observation date, applicability,
relevant claims, confidence, and unresolved access or interpretation questions.
Separate what a source states from what the analyst infers.

Use elicitation techniques suited to the uncertainty: interviews and workshops
for perspectives, observation for actual work, examples and scenarios for
behavior, prototypes for interaction risk, data analysis for frequency and
scale, and document analysis for external obligations. No technique by itself
proves completeness.

The output is an evidence-backed source inventory, observations, needs,
candidate requirements, conflicts, and open questions—not automatic acceptance.
