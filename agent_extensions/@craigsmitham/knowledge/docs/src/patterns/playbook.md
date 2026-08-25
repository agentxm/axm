---
type: Pattern
title: Playbook
description: For a recurring class of situations requiring judgment among established responses, pair explicit selection criteria with self-contained plays.
tags: [docs, playbook, pattern, operations, coordination, decision-making]
status: stable
sources:
  - id: methodgrid-origin
    resource: https://methodgrid.com/blog/from-sport-to-business-why-playbooks-underpin-success-seven-key-factors/
    title: Method Grid — From sport to business, why playbooks underpin success
  - id: etymonline-playbook
    resource: https://www.etymonline.com/word/playbook
    title: Etymonline — playbook
  - id: ise-playbook
    resource: https://microsoft.github.io/code-with-engineering-playbook/
    title: Microsoft ISE — Engineering Fundamentals Playbook
  - id: cortex-runbooks-playbooks
    resource: https://www.cortex.io/post/runbooks-vs-playbooks
    title: Cortex — Runbooks vs playbooks
  - id: uptimelabs-runbook-playbook
    resource: https://www.uptimelabs.io/learn/runbook-vs-playbook
    title: Uptime Labs — Runbook vs playbook
  - id: techtarget-compare
    resource: https://www.techtarget.com/searchitoperations/tip/Compare-runbooks-vs-playbooks-for-IT-process-documentation
    title: TechTarget — Compare runbooks vs playbooks for IT process documentation
  - id: redhat-ansible-playbook
    resource: https://www.redhat.com/en/topics/automation/what-is-an-ansible-playbook
    title: Red Hat — What is an Ansible playbook
generated: { by: "codex/gpt-5.6", at: 2026-08-15T15:48:17Z }
---

# Playbook

For a recurring class of situations requiring judgment among established
responses, **pair explicit selection criteria with self-contained plays**.

## Context

A team repeatedly encounters a recognizable family of situations. Several
responses are known, but the right response depends on conditions observed at
the time. Multiple people or roles may need to coordinate, and the person
choosing a response may not have designed it.

## Problem

How can practitioners respond consistently without pretending that one linear
procedure fits every situation?

A collection of procedures alone leaves the hardest decision unstated: which
one applies now. One large branching procedure hides reusable responses inside
a diagnostic tree and becomes difficult to rehearse, own, and update.

## Forces

- **Consistency versus judgment** — the team wants repeatable responses, but
  selection still depends on conditions.
- **Speed versus diagnosis** — readers need to act promptly without choosing a
  plausible but inappropriate procedure.
- **Modularity versus context** — each response should stand alone, while the
  collection must explain how the pieces fit.
- **Coordination versus local action** — several roles may act together, but
  each needs clear authority and responsibilities.
- **Coverage versus usability** — adding every edge case makes selection harder
  at the moment it matters.

## Solution

Create a **playbook** containing:

1. a bounded statement of the situation family it covers;
2. observable selection criteria that route the reader to one play;
3. self-contained plays, each written as a goal-oriented how-to;
4. explicit roles, authority, communication, and escalation where coordination
   matters; and
5. links to reference or explanation instead of embedding inventories and
   background inside executable plays.

Keep plays modular and independently testable. Put branching **between** plays
in the selection layer; keep only verification, recovery, and escalation
branches **within** a play.

## Consequences

- Teams gain shared response vocabulary and can rehearse discrete plays.
- Selection logic becomes reviewable rather than remaining tacit expertise.
- Individual plays can evolve without rewriting the entire collection.
- The selection layer and plays can drift apart, so they need shared ownership
  and rehearsal.
- Novel situations still fall outside the playbook and require an explicit
  escalation path rather than forced matching.

## When to use

Use this pattern when:

- a recognizable situation family recurs;
- more than one established response is legitimate;
- observable conditions can guide selection; and
- consistency or coordination matters enough to maintain the collection.

## When not to use

- One known trigger has one response — use [Runbook](runbook.md).
- The situation is novel and no established responses exist.
- The material is only a collection of unrelated advice with no selection
  problem.
- A deterministic decision and response can be automated completely.

## Pattern boundaries

The word _playbook_ is contested. Some organizations use it interchangeably
with _runbook_; business usage may mean a broad collection of preferred
practices. This pattern uses the narrower distinction because it changes the
document's design: a playbook owns selection among plays, while a runbook owns
one response after selection.

An **Ansible playbook** is executable YAML for automation tasks. Near
infrastructure code, qualify the term as _response playbook_ or _Ansible
playbook_ rather than relying on context.

## Evidence and known uses

The sports origin supplies plurality, situational selection, and coordination.
Engineering and operations playbooks repeatedly use collections of discrete
plays that practitioners select and combine for the problem at hand. The
sources above also show that industry terminology varies, which is why the
selection contract matters more than the label alone.

## Related patterns

- [Runbook](runbook.md) — a play commonly resolves to one runbook-like
  procedure after selection.
- [Pattern library](pattern-library.md) — maintains playbook and runbook
  guidance as related, evidence-bearing patterns.
- [How-to guide](../guides/how-to.md) — supplies the authoring craft for each
  individual play.
- [Explanation explainer](../explainers/explanation.md) — clarifies the
  selection rationale without absorbing procedures.
