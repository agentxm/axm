---
observed_at: "2026-09-29T00:13:30Z"
session: "e59fbc71"
area: "Nx test targets and pnpm format under concurrent agent sessions in one worktree"
---

# Concurrent test runs in one worktree hit transient missing-package errors

## Context

Three agent sessions implemented disjoint workstreams (release scripts, update
fingerprint and declaration writer, sync recovery) in one isolated worktree,
each running only its owning Nx targets.

## Friction

- A full `workspace-features:test` run in one session reported suite-level
  `Cannot find package @agentxm/workspace-kernel/...` errors while another
  session's target was rebuilding the kernel. Reruns of the same scope passed
  without changes.
- `pnpm run format` could not be used per workstream because it rewrites every
  file in the tree, including other sessions' in-progress files; each session
  formatted only its own files with a direct `prettier --write`, which the
  repository instructions otherwise forbid.
- `pnpm exec nx run cli-e2e:e2e --args='<file>'` ran nothing: `e2e` is an
  aggregate that depends on `e2e-main`, `binary-smoke`, and `install-suite` and
  ignores file arguments. The focused run needed `cli-e2e:e2e-main`.

## Cost / impact

One full-suite run per affected session was discarded as load-related and
rerun; the e2e filter form was discovered by inspecting `project.json`.

## Outcome

Each workstream's owning targets passed on rerun; the whole tree was formatted
once by the orchestrating session before the repository gates.

## Evidence

- Session reports quoting `Cannot find package @agentxm/workspace-kernel/...`
  during a concurrent kernel rebuild; later reruns `125 passed`, `811 passed`.
- `apps/cli-e2e/project.json`: `e2e` target `dependsOn`
  `["e2e-main", "binary-smoke", "install-suite"]`.
