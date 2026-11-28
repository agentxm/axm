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

Find the event identity in the delivery record and check the consumer's
application record for that identity. If you lack access, ask the consumer
to check it.

- If the consumer confirms one application, reconcile the acknowledgement
  with that record. Check that both records now refer to the same applied
  event. No resend is needed.
- If the consumer confirms it never applied the event, arrange recovery
  with the consumer using the same identity. After recovery, check the
  application record again before reconciling the acknowledgement.
- If the consumer cannot establish what happened, leave the acknowledgement
  unresolved. Record the event identity and the evidence still needed so
  the next person can resume the check without resending.
- If the record shows multiple applications, report the duplicate with its
  event identity to the consumer for correction.

The intended outcome is a reconciled record of whether the event was applied,
without a duplicate application. If the delivery record instead establishes
that the event never arrived, use [Retry an undelivered event](retry-undelivered.md).
See [Delivery states](../delivery-states.md) for the shared definitions.
