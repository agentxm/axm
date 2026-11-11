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

1. Confirm non-delivery in the event's delivery record and that the destination
   can receive it. If delivery is uncertain, establish that fact before retrying.
2. Retry the undelivered event once using its existing event identity.
3. Check the delivery record and consumer acknowledgement. The intended outcome
   is one confirmed application of the event.

If the event was delivered but its response was lost, use
[Resolve a missing acknowledgement](resolve-missing-ack.md) instead; resending
may repeat an already applied operation. See [Delivery states](../delivery-states.md)
for the shared definitions.
