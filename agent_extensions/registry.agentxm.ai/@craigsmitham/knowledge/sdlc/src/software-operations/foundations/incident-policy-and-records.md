---
type: Explanation
title: Incident policy and records
description: Why an incident record gives responders both a current brief and a chronology, and how service restoration, response closure, and recovery work can occur at different times.
tags:
- software-operations
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:43Z }
sources:
- id: migration-source
  resource: https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/delivery/work-items/incidents/index.md
  title: Existing product-engineering material before the discipline migration
- id: prior-recording-operational-incidents
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-operations/src/incidents/recording-operational-incidents.md
  title: Recording Operational Incidents
---

# Incident policy and records

A responder taking over an incident needs to know what is failing *now*.
A reviewer trying to understand an earlier decision needs to know what
the responders believed *then*. An incident record serves both readers.
Local policy establishes when impact warrants a coordinated response,
who can direct it, and who can close it. The record shows how those
choices applied to this particular incident.[^migration-source]

## What the next responder needs

Suppose a receipt service stops sending receipts. At 09:10 a responder
suspects the mail provider. At 09:25 delivery logs show that newly issued
receipts are reaching customers, but older ones are still queued. A new
responder scanning the first entry might spend time investigating a
current outage at the provider. Erasing the first entry would create a
different puzzle for the reviewer who later asks why the team contacted
the provider.

The current brief therefore goes first. In this example it gives the
affected customers, the size of the known backlog, the responder watching
the queue, and the time of the next update. The chronology preserves the
09:10 suspicion as a hypothesis, who acted on it, and the evidence that
changed the assessment at 09:25. If severity changed, its earlier basis
belongs with the earlier decision.[^prior-recording-operational-incidents]

An incident lead can hand responsibility to another responder. Recording
the transfer lets the incoming shift find the current decision-maker.
Authority to make the transfer, change a mitigation, or communicate
publicly comes from local policy. The record belongs in the incident
system and disclosure channel chosen for that response. Related alerts
can point there while retaining their own identities.[^prior-recording-operational-incidents]

## What it means to close the response

At 10:00 the queued receipts have gone out and monitoring shows normal
delivery. Suppose local policy allows the lead to close the coordinated
response after that observation. The team still has a recovery item to
reconcile receipt counts against orders and a Defect Report to investigate
why delivery stalled. Closure marks the end of the response under the
stated criteria. Each follow-up has a different owner and a different
question to settle.

The [Operational Incident Record template](../incidents/operational-incident-template.md)
keeps the mitigation and its observed effect, residual customer impact,
closure evidence, outstanding work, and conditions for reopening visible.
That lets a later shift see what “closed” meant here and recognize evidence
that would warrant another response.[^prior-recording-operational-incidents]

[^migration-source]: [Existing product-engineering material before the discipline migration](https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/delivery/work-items/incidents/index.md).
[^prior-recording-operational-incidents]: [Recording Operational Incidents](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-operations/src/incidents/recording-operational-incidents.md).
