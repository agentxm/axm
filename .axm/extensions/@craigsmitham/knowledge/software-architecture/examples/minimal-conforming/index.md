---
okf_version: "0.2"
---

# Reservation platform architecture

This documentation set adopts the
[software-architecture-docs profile](../../src/architecture-documentation/software-architecture-application-profile.md)
version 0.9.0.

- [System lifecycle](lifecycle.md) - The support state, change horizon,
  expected evolution, and review triggers for the synthetic reservation
  platform.
- [System ownership](ownership.md) - The stable maintenance accountability and
  escalation route for the synthetic reservation platform.
- [Architecture decision policy](decisions.md) - The policy for accepting,
  recording, superseding, and reconsidering decisions in the synthetic
  reservation platform.
- [System assurance](assurance.md) - The confidence, evidence, review, and
  reassessment obligations for the synthetic reservation platform.
- [Confirm a reservation](use-cases/confirm-reservation.md) - How a requester
  turns an eligible capacity hold into a confirmed reservation.
- [Reservation platform](structure/systems/reservation-platform.md) - The
  synthetic software system that accepts reservation requests and preserves
  capacity promises.
- [Reservation service](structure/containers/reservation-service.md) - The server application that owns reservation state and coordinates capacity promises.
- [Reservation application](structure/containers/reservation-service/components/reservation-application.md) -
  The cohesive component that applies reservation policy and coordinates reservation state changes.
