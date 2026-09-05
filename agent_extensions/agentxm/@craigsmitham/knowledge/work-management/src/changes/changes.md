---
type: Explanation
title: Changes as work items
description: Explains how a Change coordinates one bounded software modification while specifications, designs, implementation, evidence, and planning records retain their own responsibilities.
tags: [change, software-change, change-request, coordination, scope, delivery, verification]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Changes as work items

A **Change** is the durable coordination case for one bounded proposed or
authorized software modification. It preserves identity, motivation, intended
outcome, scope, classification, relevant sources, relationships, decisions,
delivery state, verification, residual risk, and next action.

A Change does not become approved merely because it exists. It also does not
own every artifact used to understand or realize it. Requirements,
specifications, architecture decisions, designs, implementation plans, code,
tests, deployments, and operational evidence remain in their native forms and
authorities. The Change links their exact identities and preserves only the
context needed to coordinate the bounded case.

## Boundaries

One Change should have a coherent intended outcome, decision boundary,
delivery path, and verification boundary. Split work when parts can be
accepted, delivered, rolled back, verified, or closed independently. Relate
the resulting Changes rather than hiding independent state in one record.

Unbounded ideas and requests may remain in a host-native intake record until a
recognizable outcome and boundary emerge. Tasks and stories may plan portions
of delivery; they do not replace the Change's identity or outcome.

## State

Keep proposal and authorization, delivery, verification, and closure distinct.
A proposed Change can be declined without implementation. An implemented
Change can remain unverified. A verified result may still leave follow-up or
residual risk. Closure records the local authority's end to this Change's
active lifecycle, not the automatic closure of related reports or incidents.

When a Change explicitly remediates an established Defect, classify it as
Bugfix and preserve links to the originating Defect Reports.
