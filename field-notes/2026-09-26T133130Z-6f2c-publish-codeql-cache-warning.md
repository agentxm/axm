---
observed_at: "2026-09-26T13:31:30Z"
session: "6f2c"
area: "release workflow CI"
---

# CodeQL flagged preview-source checkout in publication workflow

## Context

The draft release PR moved publication source selection into a script and ran GitHub CI.

## Friction

CodeQL reported one high-severity cache-poisoning alert at the source job checkout in `.github/workflows/publish.yml`, where a manual preview could select a source SHA before the job ran local tooling.

## Cost / impact

The draft PR had a failing CodeQL check and required another workflow and selection-script change.

## Outcome

The source job now checks out `main` for tooling and validates the requested source revision separately. The focused publication specification passed 13 tests; hosted CodeQL had not rerun at capture time.

## Evidence

Draft PR #455, CodeQL check run `108412896316`; annotation at `.github/workflows/publish.yml:79-84`; `scripts/resolve-release-source.ts`.
