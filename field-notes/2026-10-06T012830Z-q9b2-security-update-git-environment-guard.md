---
observed_at: "2026-10-06T01:28:30Z"
session: "unknown"
area: "dependency verification"
---

# Security update rejects the Git adapter's environment

## Context

Reviewing Dependabot PR #523 with simple-git 4.0.2 and argv-parser 2.0.1.

## Friction

The remaining-projects CI partition fails because the new environment guard
rejects GIT_SSH_COMMAND and GIT_TERMINAL_PROMPT supplied by the Git adapter.
Its existing inherited-transport regression also fails in a focused local run.

## Cost / impact

The prepared dependency update requires an adapter correction before integration.

## Outcome

The adapter declares its filtered inherited process environment and fixed
noninteractive overrides through allowEnvironment. Both focused Git operation
and manifest-discovery files pass all 31 cases. Full verification is pending.

## Evidence

- Public CI run 37398175516, remaining-projects job 112059155044.
- workspace-kernel:test: operations.test.ts and
  discovers-all-manifest-kinds-from-git-and-path.spec.ts.
