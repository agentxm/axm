---
type: Playbook
title: Resolve a missing acknowledgement
description: Resolve an event delivered without an acknowledgement by checking whether the consumer applied it.
tags: [webhook, acknowledgement-timeout, response-lost, duplicate]
status: draft
---

# Resolve a missing acknowledgement

In this fictional delivery system, an acknowledgement timeout after recorded
delivery leaves application uncertain: the response may be lost even though
the consumer applied the event. This procedure resolves that uncertainty.

1. Match the event identity against the consumer's application record.
2. If it was already applied, reconcile the acknowledgement without resending.
3. If the consumer confirms it was not applied, arrange recovery using the same
   event identity. If application remains unknown, keep that uncertainty visible
   and investigate; do not assume that a timeout authorizes another attempt.

The intended outcome is a reconciled record of whether the event was applied,
without a duplicate application. If the delivery record instead establishes
that the event never arrived, use [Retry an undelivered event](retry-undelivered.md).
See [Delivery states](../delivery-states.md) for the shared definitions.
