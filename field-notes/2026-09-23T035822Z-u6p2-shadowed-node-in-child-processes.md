---
observed_at: "2026-09-23T03:58:22Z"
session: "u6p2"
area: "local validation toolchain"
---

# Child processes selected a shadowed Node runtime

## Context

Running repository verification and comparing discovery measurements under the
repository-pinned Node 24.19.0 and Bun 1.3.14 toolchain.

## Friction

The shell resolved Node 22.23.1. `mise exec -- node --version` reported 24.19.0,
but `mise exec -- pnpm exec node --version` still reported 22.23.1. Actual Vitest
workers also used the older executable. The first attempted pinned rerun had
to be stopped because its child-process toolchain did not match the pin.

## Outcome

Prepending the tool directories returned by `mise which node`, `mise which
pnpm`, and `mise which bun` to the session PATH, then invoking pnpm directly,
selected Node 24.19.0 in child processes. No machine configuration was changed.
The focused 22 tests, CLI typecheck, and uncached full `verify:pr` passed under
that toolchain. Discovery measurements still require their pinned rerun.
