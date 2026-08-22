---
type: Reference
title: Delegation, handoffs, and artifacts
description: Defines responsibility transfer, authority, context, deliverables, acceptance, and return paths.
tags: [delegation, handoffs, artifacts, responsibility, authority, acceptance, escalation]
status: stable
sources:
  - id: fipa-management
    resource: https://www.fipa.org/specs/fipa00023/SC00023J.html
    title: FIPA Agent Management Specification
  - id: a2a-concepts
    resource: https://a2a-protocol.org/latest/topics/key-concepts/
    title: Agent2Agent protocol — Key concepts
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Delegation, handoffs, and artifacts

Delegation assigns bounded responsibility; a handoff transfers responsibility.
Neither is merely sending a prompt.

Every delegation or handoff should identify:

- delegator, recipient, and accountable owner;
- goal, scope, exclusions, and priority;
- granted authority, credentials, budget, and expiry;
- relevant context with provenance and freshness;
- expected artifact or effect and acceptance evidence;
- current state, dependencies, and unresolved uncertainty;
- progress, cancellation, timeout, failure, and escalation protocol;
- whether the recipient may subdelegate.

The sender validates that the task is delegable and the recipient is capable.
The recipient acknowledges or rejects the responsibility. The accountable
owner verifies the returned artifact or external effect before treating the
delegation as complete.

Protocol standards help with identity and envelopes, not semantic correctness.
FIPA's management model covers agent identity, registration, location,
communication, and lifecycle.[^fipa-management] A2A models agent cards, tasks,
messages, parts, artifacts, streaming, and authentication.[^a2a-concepts]
Agent engineering must still define responsibility, trust, acceptance, and
failure behavior for the application.

[^fipa-management]: FIPA Agent Management Specification

[^a2a-concepts]: Agent2Agent protocol — Key concepts
