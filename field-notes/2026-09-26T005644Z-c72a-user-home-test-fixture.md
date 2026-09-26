---
observed_at: "2026-09-26T00:56:44Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "CLI user-scope test harness"
---

# User-scope import test did not use the process AXM_USER_HOME override

## Context

An MCP import test was added to verify adoption of a home-relative YAML target in user scope. The test set `process.env["AXM_USER_HOME"]` to a temporary directory and wrote an initialized user workspace there.

## Friction

The test failed with `WorkspaceNotInitialized` at `/home/exedev/.axm/workspace/axm.json`, rather than reading the temporary workspace. The new test could not reach the import behavior on its first run.

## Cost / impact

One failed `cli:test` run and a retry after changing the test setup.

## Outcome

The test setup instead changed `HOME` for the test and restored it afterward. The focused CLI import suite then passed, including the new user-scope YAML case (13 tests).

## Evidence

`pnpm exec nx run cli:test --args="src/root/mcps/import.test.ts"` first reported `WorkspaceNotInitialized` with the settings path above; the retry passed 13 tests.
