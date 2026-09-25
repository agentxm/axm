---
observed_at: "2026-09-25T01:27:00Z"
session: "rc7k"
area: "test fixtures: Registry client factory transport binding"
---

# Factory-bound transports made two fixture failures read as product failures

## Context

Replacing fourteen direct `createRegistryClient` calls with the
`RegistryClientFactory` port in `@agentxm/workspace`. Fixtures previously let
features pick up whatever `HttpClient` a test provided last; the factory binds
its transport when its layer is built.

## Friction

Two tests failed after the port swap for fixture reasons that were not visible
from the failure text: a publish upload lost its `Authorization` header because
the publish world built the factory over the raw transport before the auth
middleware wrapped it, and a CLI publish test timed out because it provided its
recording `HttpClient` after the harness had already bound a different one into
the factory.

## Cost / impact

Two extra focused test runs and reading of three fixture files to locate the
binding order; the publish world and one CLI test were restructured.

## Outcome

Fixed by building the publish world's factory over the authenticated transport
and passing the CLI test's recording port into the harness that builds the
factory. Both tests pass.

## Evidence

`expected undefined to be 'Bearer SYNTHETIC_PUBLICATION_SESSION'` from
`src/publishing/authorization/publishing-requires-a-signed-in-person.spec.ts`;
`Test timed out in 5000ms` from `apps/cli/src/root/publish/command.test.ts`
("creates no server state during a signed-out preview").
