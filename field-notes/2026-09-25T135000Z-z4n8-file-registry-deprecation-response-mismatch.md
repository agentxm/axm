---
observed_at: "2026-09-25T13:50:00Z"
session: "z4n8"
area: "CLI migration end-to-end test setup with a local file Registry"
---

# Local Registry deprecate response did not match the client schema

## Context

The new CLI process test published two skills to a local file Registry, then
tried to mark one superseded with `axm deprecate` before exercising migration.

## Friction

The deprecate command exited 10 and reported that the Registry response did
not match the expected schema.

## Cost / impact

The first end-to-end test attempt stopped before its migration assertions.

## Outcome

The test fixture now writes the deprecation to the local Registry index so it
can exercise the requested `migrate` command path.

## Evidence

`cli-e2e:e2e-main` failed at the deprecate setup step with "Registry response
did not match the expected schema" and exit code 10.
