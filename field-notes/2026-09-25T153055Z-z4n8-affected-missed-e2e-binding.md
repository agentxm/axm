---
observed_at: "2026-09-25T15:30:55Z"
session: "z4n8"
area: "public specification catalog and CLI end-to-end verification"
---

# Affected verification missed a retired E2E requirement binding

## Context

The public client removed the Registry step-up request flow and retired its specification identities. Local `pnpm run verify:affected` passed.

## Friction

The full CI generation step failed because `apps/cli-e2e/src/auth.e2e.test.ts` still bound its execution to a retired requirement. The imported token E2E scenarios also used the removed step-up endpoint.

## Cost / impact

The public CI run failed after the earlier local gate passed, requiring another edit, verification run, and exact-commit CI attempt before preview publication.

## Outcome

The E2E entrypoint and HTTP Registry fixture were changed to exercise the current browser-only token-creation refusal. The specification catalog was regenerated. Focused and full verification remain pending.

## Evidence

CI run `36154336031` reported `execution binding references unknown requirement` from `apps/cli-e2e/src/auth.e2e.test.ts` during `axm:generate:specification-catalog`.
