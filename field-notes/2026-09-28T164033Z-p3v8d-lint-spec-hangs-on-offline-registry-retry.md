---
observed_at: "2026-09-28T16:30:30Z"
session: "cae9dea3"
area: "lint executable specifications"
---

# Lint specs time out once a Registry package becomes usable

## Context

Giving lint official-skill fixtures a real accepted Registry lock row.

## Friction

Specs using `it.effect` timed out at 5000ms. A usable Registry package makes lint query the Registry for deprecation; the offline test transport fails and the request policy's retry backoff never advances under the test clock.

## Cost / impact

Three cases hung for 5s each; one diagnostic run plus reading `request-policy.ts` and test helpers.

## Outcome

Switched the two affected specs to `it.live`, so bounded retries (200ms initial backoff, 3 attempts) elapse in real time.

## Evidence

`Error: Test timed out in 5000ms.` in `declared-official-skill-must-be-compatible.spec.ts`; `DEFAULT_REGISTRY_REQUEST_POLICY` in `packages/supporting/registry-client/src/request-policy.ts`.
