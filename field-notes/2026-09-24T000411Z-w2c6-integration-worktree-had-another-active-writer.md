---
observed_at: "2026-09-24T00:04:11Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "multi-agent worktree assignment"
---

# Assigned integration worktree had another active writer

## Context

An integration task was assigned one worktree to make a merged branch coherent,
verify it, and commit. The instructions said not to run two nx invocations at
once in that worktree.

## Friction

At start, `git status` showed an uncommitted change the task did not describe,
modified about 40 seconds earlier. Within the next minutes two more files changed
while nothing in this session had edited them. The first `workspace:typecheck`
was fully cached, which showed someone had already run it on that tree. The
writer never identified itself.

## Cost / impact

Three messages were sent to the coordinator. Each nx run was preceded by a check
for running nx processes and file modification times. The final commit had to
leave out the other writer's files, so verification ran on a tree that
contained changes the commit does not.

## Outcome

The other writer stopped editing at 00:05:23 UTC. Its three files stayed
uncommitted in the worktree for their owner. The coordinator had not replied
when verification started.

## Evidence

Foreign files: `packages/core/workspace/src/lifecycle/update/selective/subagents.ts`,
`packages/core/workspace/src/desired-state/workspace/test-helpers.ts`,
`packages/core/workspace/src/lifecycle/update/advances-resolution-within-intent.spec.ts`.
