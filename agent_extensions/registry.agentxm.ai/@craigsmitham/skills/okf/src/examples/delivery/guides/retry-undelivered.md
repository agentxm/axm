---
type: Playbook
title: Retry an undelivered event
description: Recover an event that was never delivered after its destination becomes available.
tags: [webhook, connection-refused, not-delivered, retry]
status: draft
---

# Retry an undelivered event

In this fictional delivery system, use this procedure when the delivery record
confirms that the event never reached the consumer and its destination is now
available. For example, a connection was refused before transmission.

1. Read the delivery record for this event identity. If the record already
   shows delivery, skip the retry and check the result in step 3. If it is
   inconclusive or the destination is still unavailable, leave the event
   pending. Resume when you can confirm both non-delivery and availability.
2. Retry the undelivered event once using its existing event identity.
3. Check the result for the recorded attempt.
   - If the consumer acknowledged it, match the acknowledgement to the
     event identity and confirm that the consumer recorded one application.
   - If it arrived but the acknowledgement is missing, follow
     [Resolve a missing acknowledgement](resolve-missing-ack.md) before
     considering another attempt.
   - If it failed before transmission, record the new failure and leave
     the event pending. If delivery is uncertain, keep the attempt open
     until the delivery record or the consumer can establish what happened.

See [Delivery states](../delivery-states.md) for the shared definitions.
