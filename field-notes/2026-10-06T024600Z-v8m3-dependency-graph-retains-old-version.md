---
observed_at: "2026-10-06T02:46:00Z"
session: "unknown"
area: "Nx local affected verification"
---

# Dependency graph retained the previous smol-toml version

## Context

Verify the Library consumer after adopting security-fixed main and completing
its frozen dependency installation.

## Friction

Affected verification stopped at workspace-kernel dependency lint. Nx reported
smol-toml 1.8.0 outside the catalog range, while the lockfile and installed
workspace package resolved to 1.9.0. The local project graph still referenced
1.8.0 for workspace consumers.

## Cost / impact

The affected attempt exited 130 after 1m 2s. Continuing required a workspace
graph reset and a focused lint run, which took 23.1s.

## Outcome

`pnpm exec nx reset --onlyWorkspaceData` followed by the repository-backed
workspace-kernel lint target passed without changing source or dependencies.
Full affected verification still needs to resume.

## Evidence

- Failed target: `workspace-kernel:lint`, `@nx/dependency-checks` at package.json
  dependency entry 178.
- Installed package and lockfile: smol-toml 1.9.0.
- Focused lint recovery: exit 0.
