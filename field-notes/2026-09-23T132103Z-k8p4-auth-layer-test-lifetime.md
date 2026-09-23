---
observed_at: "2026-09-23T13:21:03Z"
session: "k8p4"
area: "registry-access tests and Effect Layer lifetime"
---

# Auth concurrency tests used a client after its Layer closed

## Context

The keyed semaphore change made SessionRefresher's lock table scoped to its Layer. The focused concurrent-renewal specification passed.

## Friction

`pnpm run verify:affected` failed two `auth-middleware.test.ts` concurrency cases with `InterruptError: All fibers interrupted without error`. Both tests acquired `HttpClient` with `Effect.provide(layers)` and then ran requests after that provided effect completed.

## Cost / impact

The affected workflow stopped before downstream workspace, CLI, and policy tasks. Two test cases required scope correction and a rerun.

## Outcome

The two tests were changed to run client acquisition and all requests within one `Effect.provide(layers)` scope. Verification of that correction was still pending when this note was written.

## Evidence

`/tmp/axm2105-keyed-verify-affected.log` records the two failed cases and exit 130. The test cases are in `packages/supporting/registry-access/src/adapters/auth-middleware.test.ts`.
