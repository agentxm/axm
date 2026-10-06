---
observed_at: "2026-10-06T18:20:34Z"
session: "c8f4"
area: "Nx staged compiler caching"
---

# Repeated staged checks exposed cache uncertainty

## Context

A regression fixture checks a valid producer twice, then stages a number-valued
producer while its unchanged consumer requires a string. Git, lint-staged,
Nx 23.2.1, and the native compiler are real.

## Friction

One focused run reported success for the final incompatible producer; a
subsequent run passed the regression. The cause was not established. An attempted
disposable `NX_WORKSPACE_DATA_DIRECTORY` then eliminated expected compiler
cache hits: Nx's local cache database lived in that disposable directory.

## Cost / impact

Additional focused runs and inspection of installed Nx cache-directory and
database code were needed before claiming valid cache reuse.

## Outcome

The disposable workspace-data approach was removed. The adapter disables the
daemon and incremental project-graph cache while leaving task cache locations
and target contracts intact. Focused cache-invalidation evidence remains part
of delivery verification.
