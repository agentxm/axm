---
type: C4 Component
title: Reservation application
description: The cohesive component that applies reservation policy and coordinates reservation state changes.
tags: [reservation, application-component]
status: draft
generated: { by: codex/gpt-5.6, at: 2026-08-23T01:30:58Z }
---

# Reservation application

The Reservation application belongs to exactly one C4 Container:
[Reservation service](../../reservation-service.md). It accepts reservation
commands through its defined application interface, applies eligibility and
confirmation policy, and coordinates authoritative reservation state changes.
It does not own external capacity-provider truth or transport concerns.

Its system context is inherited through the Reservation service;
there is no consequential exception. Exact packages, dependencies, and tests
remain with executable repository evidence.
