---
type: Requirement
title: Rejected confirmation preserves capacity
description: A rejected confirmation does not consume or release reserved capacity.
tags: [requirements, reservations, capacity]
status: draft
requirement_id: RES-REQ-0001
requirement_type: functional
subject: /system.md
requirement_sources:
  - /use-cases/confirm-reservation.md
generated: { by: codex/gpt-5.6, at: 2026-08-25T00:00:00Z }
---

# Rejected confirmation preserves capacity

## Requirement

When confirmation is rejected before a reservation reaches confirmed state,
the Reservation platform shall preserve the reservation's existing capacity
commitment.

## Rationale

Changing capacity after a rejected confirmation would make the reservation
outcome ambiguous and could expose capacity promised to another requester.
