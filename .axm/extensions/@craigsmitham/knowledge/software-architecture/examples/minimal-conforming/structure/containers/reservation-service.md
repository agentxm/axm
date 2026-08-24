---
type: C4 Container
title: Reservation service
description: The server application that owns reservation state and coordinates capacity promises.
tags: [reservation-service, server-application]
status: draft
generated: { by: codex/gpt-5.6, at: 2026-08-22T00:17:07Z }
---

# Reservation service

The Reservation service is contained by exactly one C4 Software System:
[Reservation platform](../systems/reservation-platform.md). It is a server
application whose runtime boundary owns reservation state and coordinates the
policy for confirming a held allocation. It does not settle payments or own
capacity-provider records.

The service receives confirmation requests from an external interface and
uses capacity-provider evidence through an explicit boundary. Exact protocols,
deployments, and technology versions remain with executable authorities.

- Component: [Reservation application](reservation-service/components/reservation-application.md)
- Lifecycle and stewardship: Inherited from the Reservation platform; there is
  no consequential exception.
