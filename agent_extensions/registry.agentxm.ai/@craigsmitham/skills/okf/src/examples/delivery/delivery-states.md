---
type: Reference
title: Delivery states
description: Distinguish non-delivery, delivery without acknowledgement, and confirmed application in the fictional delivery system.
tags: [delivery, acknowledgement, application-record]
status: draft
---

# Delivery states

This fictional system records transmission separately from the consumer's
application of an event. Acknowledgements can be lost after application.

| Observed state | What is established | Next decision |
|---|---|---|
| Not delivered | The event never reached the consumer. | After recovery, use [Retry an undelivered event](guides/retry-undelivered.md). |
| Delivered, acknowledgement missing | Transmission occurred; application is uncertain. | Use [Resolve a missing acknowledgement](guides/resolve-missing-ack.md). |
| Application confirmed | The consumer recorded applying this event identity. | Reconcile a missing acknowledgement without resending. |
