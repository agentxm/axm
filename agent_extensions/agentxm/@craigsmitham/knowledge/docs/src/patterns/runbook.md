---
type: Pattern
title: Runbook
description: For one recognized operational trigger with an established response, provide a linear verified procedure with rollback and escalation conditions.
tags: [docs, runbook, pattern, operations, incident-response, verification]
status: stable
sources:
  - id: uptimelabs-runbook-playbook
    resource: https://www.uptimelabs.io/learn/runbook-vs-playbook
    title: Uptime Labs — Runbook vs playbook
  - id: cortex-runbooks-playbooks
    resource: https://www.cortex.io/post/runbooks-vs-playbooks
    title: Cortex — Runbooks vs playbooks
  - id: techtarget-compare
    resource: https://www.techtarget.com/searchitoperations/tip/Compare-runbooks-vs-playbooks-for-IT-process-documentation
    title: TechTarget — Compare runbooks vs playbooks for IT process documentation
  - id: solarwinds-runbook-playbook
    resource: https://www.solarwinds.com/blog/runbook-vs-playbook-whats-the-difference
    title: SolarWinds — Runbook vs playbook
  - id: redhat-ansible-playbook
    resource: https://www.redhat.com/en/topics/automation/what-is-an-ansible-playbook
    title: Red Hat — What is an Ansible playbook
  - id: diataxis-how-to
    resource: https://diataxis.fr/how-to-guides/
    title: Diátaxis — How-to guides
generated: { by: "codex/gpt-5.6", at: 2026-08-15T15:48:17Z }
---

# Runbook

For one recognized operational trigger with an established response,
**provide a linear verified procedure with rollback and escalation
conditions**.

## Context

A known operational task or failure mode recurs. The reader may be on call,
under time pressure, unfamiliar with the procedure, and working on a system
where an incorrect action can increase the blast radius.

## Problem

How can any qualified responder execute the established response safely
without relying on the original author's memory or improvising under pressure?

An ordinary how-to may omit the trigger, expected output, stop conditions, or
rollback because its reader chose the task and can adapt calmly. Those
omissions become hazards during an incident.

## Forces

- **Speed versus safety** — action is urgent, but unchecked action can worsen
  the incident.
- **Precision versus adaptability** — the known response should be exact, but
  observed state may require stopping rather than continuing.
- **Completeness versus cognitive load** — responders need everything required
  to act, not background they can read later.
- **Human judgment versus automation** — deterministic work should be
  automated, while remaining decisions must be explicit.
- **Current accuracy versus maintenance cost** — every system change can make
  a command, screen, threshold, or assumption stale.

## Solution

Create a **runbook** that:

1. names the exact alert, symptom, or scheduled trigger that sends a responder
   here;
2. states access, tooling, state, and safety preconditions;
3. gives one deliberately linear sequence of exact actions;
4. places expected output or verification after every consequential action;
5. states when to stop and escalate before the reader reaches that condition;
6. supplies a rollback or safe-abort path and its availability boundary; and
7. links to reference and explanation rather than interrupting execution with
   inventories or background.

Test the runbook with someone other than its author. Where no judgment remains,
automate the procedure and retain prose as description and recovery guidance.

## Consequences

- Response becomes transferable and silent failures become visible earlier.
- The responder can stop knowingly instead of improvising beyond the known
  path.
- Verification and rollback make the document longer than an ordinary linear
  checklist.
- The runbook becomes operational capability only when rehearsed; otherwise it
  remains an untested claim.
- The tighter the procedure is coupled to the system, the faster it can become
  stale.

## When to use

Use this pattern when:

- the trigger and desired outcome are known;
- one established response path fits that condition;
- incorrect execution has meaningful operational cost; and
- the procedure can be verified and rehearsed.

## When not to use

- The reader must first choose among several responses — use
  [Playbook](playbook.md).
- The failure is novel or the trigger is too ambiguous to identify one path.
- The reader is learning the system from zero — write a tutorial separately.
- The procedure is deterministic and safely automatable end to end.

## Pattern boundaries

A runbook still branches for **verify and continue**, **roll back**, or **stop
and escalate**. Those branches remain inside one procedure. A fork between
different procedures belongs to a playbook's selection layer.

The terms *runbook* and *playbook* are not standardized across organizations.
Use local vocabulary, but preserve the structural distinction when it helps:
one selected response versus selection among responses.

## Evidence and known uses

Operations literature consistently associates runbooks with repeatable tasks,
incident response, exact procedures, and increasing automation. Diátaxis
how-to guidance supplies the underlying goal-oriented craft; the operational
sources add the trigger, verification, recovery, and time-pressure conditions
that distinguish this pattern.

## Related patterns

- [Playbook](playbook.md) — routes a practitioner to the appropriate response
  when several are available.
- [Pattern library](pattern-library.md) — keeps runbook guidance connected to
  related patterns and lifecycle evidence.
- [How-to guide](../guides/how-to.md) — supplies the underlying procedure
  craft.
- [Reference explainer](../explainers/reference.md) — owns inventories and
  exact system facts that the runbook should link rather than duplicate.
