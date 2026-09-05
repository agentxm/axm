---
type: Guide
title: Authoring Changes
description: Use when a bounded proposed or authorized software modification needs consistent motivation, outcome, scope, constraints, completion, verification, risks, and next action.
tags: [change, authoring, outcome, scope, acceptance-criteria, verification, rollout, rollback]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Authoring Changes

The workflow retains portable Change coordination from the earlier model while
folding useful why-and-what content into one process-agnostic work item instead
of requiring separate stages.

## 1. Bind one Change

Identify the exact existing item or create one new identity for a coherent
outcome and boundary. Preserve originating requests, Defect Reports, incidents,
decisions, or other sources without upgrading their maturity.

## 2. State motivation and intended outcome

Explain why the Change exists, who or what is affected, and what observable
outcome should differ. Keep the outcome independent of one implementation when
several approaches remain possible. Do not invent product priority, desired
behavior, or approval.

## 3. Bound scope

State included behavior, systems, data, interfaces, users, and conditions, plus
material exclusions and non-goals. Split independently decidable or deliverable
work when one item cannot carry truthful state.

## 4. Preserve constraints and peer authorities

Link relevant specifications, contracts, requirements, policies, architecture
decisions, designs, operational limits, compatibility promises, and data
obligations. Summarize only the case-specific consequence. Apply
[repository-specific considerations](../common/applying-project-specific-considerations.md)
when their trigger conditions hold.

## 5. Define completion and verification

State observable acceptance or completion conditions. Then describe how
evidence may be gathered and the revision, environment, inputs, or observation
window to which a result would apply. Keep planned tests distinct from results
and delivery distinct from verification.

## 6. Preserve technical and delivery context proportionately

Retain supplied alternatives, selected approach, implementation sequence,
rollout, migration, rollback, operational readiness, and test strategy with
their current decision state. Link stable peer artifacts rather than requiring
a separate specification or design document for every Change.

## 7. Expose risk and next action

Record material risks, unknowns, open decisions, dependencies, owners,
authorities, and the next authorized action. Derive the title and summary last,
map facts to native fields, and read back any external write.
