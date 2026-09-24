---
observed_at: "2026-09-24T00:08:00Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "cross-agent messaging while sequencing agents in one worktree"
---

# Late handoff message added a second writer to the integration worktree

## Context

An orchestrating session ran one implementation agent per work package in
separate worktrees, then merged the branches into one worktree and started an
integration agent there. A follow-up message had been sent to the earlier
implementation agent while it was inside a long verification run. That agent
reported its work committed and went idle before the message was delivered.

## Friction

After the merge, the integration agent found three files being edited by
another writer, first one file, then three, with a `workspace:typecheck` run
it had not started. The earlier agent had resumed on the queued follow-up
message after reporting completion, in the worktree the integration agent now
owned. A stop message to the earlier agent was not acted on because that agent
was again inside a tool run; it had to be stopped forcibly.

## Cost / impact

Two integration-agent reports and three orchestrator messages were spent on
ownership before integration work continued. The three partially edited files
(a fixture helper, one specification, one planner) had to be handed over
unverified for the integration agent to assess. Not measured: elapsed delay.

## Outcome

The earlier agent was stopped with the task-stop tool. Its uncommitted edits
were left in place and assigned to the integration agent to verify, rework,
or revert. Integration continued with one writer.

## Evidence

Integration agent messages at about 00:03 and 00:06 UTC naming
`lifecycle/update/selective/subagents.ts` (+58/-15, modified 00:03:33 UTC),
then `desired-state/workspace/test-helpers.ts` and
`lifecycle/update/advances-resolution-within-intent.spec.ts`. `git status
--short` after the stop listed exactly those three files.

## Existing context

Messages to a running agent are delivered at its next tool round, so a message
sent during a long verification run lands after the agent's completion report.
