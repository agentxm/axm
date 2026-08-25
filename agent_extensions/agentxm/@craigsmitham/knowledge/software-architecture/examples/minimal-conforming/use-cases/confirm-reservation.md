---
type: Use Case
title: Confirm a reservation
description: How a requester turns an eligible capacity hold into a confirmed reservation.
tags: [reservation, requester, actor-goal]
status: draft
generated: { by: codex/gpt-5.6, at: 2026-08-25T19:19:59Z }
---

# Confirm a reservation

- Subject boundary: [Reservation platform](../structure/systems/reservation-platform.md)
- Primary actor role: Requester
- Actor goal: Turn an eligible capacity hold into a confirmed reservation.
- Successful outcome: The platform records one confirmed reservation and
  returns its reference to the requester.
- Goal scope: `user-goal`

## Main success scenario

1. The requester identifies an eligible capacity hold.
2. The platform confirms that the hold remains eligible.
3. The platform records the reservation as confirmed.
4. The platform returns the confirmation reference.

## Material extension

A confirmation rejected before confirmed state is a material extension. The
required capacity-state outcome is owned by
[RES-REQ-0001](../system/requirements/functional/rejected-confirmation-preserves-capacity.md);
this use case supplies the actor-goal context and source scenario without
duplicating the binding statement.

Exact eligibility cases and interface contracts belong to executable tests and
schemas; this concept owns only the durable actor goal and outcome.
