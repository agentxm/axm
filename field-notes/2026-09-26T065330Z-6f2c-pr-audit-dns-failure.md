---
observed_at: "2026-09-26T06:53:30Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "public AXM PR verification workflow"
---

# Dependency audit could not reach npm during PR verification

## Context

The product branch's `pnpm run verify:pr` workflow began with `axm:audit:dependencies` after all 55 mandatory product commits were in place.

## Friction

`pnpm audit --prod --audit-level high` failed with `ERR_PNPM_AUDIT_BAD_RESPONSE` because DNS lookup for `registry.npmjs.org` failed. The workflow stopped before its later verification stages.

## Cost / impact

The audit target ran for 1 minute 10 seconds. A complete local `verify:pr` result remains unavailable.

## Outcome

The workflow exited 1. The branch remains committed for hosted verification when network access is available.

## Evidence

`pnpm run verify:pr` reported `dns error` and `Temporary failure in name resolution` while requesting the npm advisory endpoint.
