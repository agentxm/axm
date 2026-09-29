---
observed_at: "2026-09-29T21:26:21Z"
session: "tn5h"
area: "Agent execution environment"
---

# Agent permissions changed during release verification

## Context

The agent was validating two release E2E deadline adjustments in an isolated checkout. The focused E2E target had passed 23 tests; affected verification was running.

## Friction

The host changed to restricted filesystem and network access. The previous execution handle returned `Unknown process id`; the affected-verification log contained passing suites but no aggregate completion. The existing checkout became read-only, and the GitHub CLI could no longer connect to `api.github.com`.

## Cost / impact

The agent copied the checkout into writable temporary storage and attempted an offline dependency install. The first attempt lacked metadata in the temporary cache; copying existing package metadata allowed the policy check to pass, but the next install failed because `xml-naming@0.3.0` was absent from the offline package store. Aggregate local verification remained unconfirmed.

## Outcome

The prepared changes were preserved. The GitHub connector remained available for publishing a draft pull request and observing remote verification.
