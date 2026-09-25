---
observed_at: "2026-09-25T11:30:00Z"
session: "mq22"
area: "test fixtures: lifecycle fixture HTTP transport"
---

# Lifecycle fixture pinned a refusing transport, so the live smoke could not use production routes

## Context

Deleting the unused MCP uninstall pipeline in `@agentxm/workspace` and
retargeting its only remaining caller, the opt-in chrome-devtools live smoke
test, to the production install and uninstall routes.

## Friction

The production routes are driven in tests through `makeLifecycleFixture`,
which composed a fixed `HttpClient` that dies on every request. The smoke test
needs a real transport against a live Registry, and the fixture exposed no way
to supply one, unlike `makeSyncFixture`, which already takes an `httpClient`
option.

## Cost / impact

One extra fixture change in `lifecycle/testing.ts` (an `httpClient` layer
option) before the smoke test could be rewritten. The smoke itself remains
env-gated and was not run in this session.

## Outcome

Added the option with the refusing client as its default and rewrote the smoke
over `applyInstall` / `applyUninstall`. Nothing else changed.

## Evidence

- `packages/core/workspace/src/lifecycle/testing.ts` (`LifecycleFixtureOptions.httpClient`)
- `packages/core/workspace/src/mcp-connections/lifecycle/operations/chrome-devtools-live-smoke.test.ts`
