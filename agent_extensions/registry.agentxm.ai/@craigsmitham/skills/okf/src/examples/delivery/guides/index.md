# Delivery procedures

Choose by what is known about delivery. A missing acknowledgement does not tell
you whether the consumer applied the event.

## Never delivered

* [Retry an undelivered event](retry-undelivered.md) - Recover an event that was never delivered after its destination becomes available.

## Delivered without acknowledgement

* [Resolve a missing acknowledgement](resolve-missing-ack.md) - Resolve an event delivered without an acknowledgement by checking whether the consumer applied it.
