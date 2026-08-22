---
okf_version: "0.2"
---
# Reservation platform architecture

This documentation set adopts the
[software-architecture-docs profile](../../src/architecture-documentation/software-architecture-application-profile.md)
version 0.7.0.

- [Confirm a reservation](use-cases/confirm-reservation.md) - How a requester
  turns an eligible capacity hold into a confirmed reservation.
- [Reservation platform](structure/systems/reservation-platform.md) - The
  synthetic software system that accepts reservation requests and preserves
  capacity promises.
- [Reservation service](structure/containers/reservation-service.md) - The server application that owns reservation state and coordinates capacity promises.
- [Reservation application](structure/containers/reservation-service/components/reservation-application.md) -
  The cohesive component that applies reservation policy and coordinates reservation state changes.
