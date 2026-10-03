---
observed_at: "2026-10-03T10:34:06.852741+00:00"
session: "f4c2"
area: "Git conflict reconciliation"
---

# Conflict replacement damaged the working lockfile

## Context

Rebasing native Hooks onto newer native MCP, subagent, and source-lifecycle changes.

## Friction

An agent conflict-replacement script used a multiline expression that consumed more than a conflict block. Several working files were truncated. Restoring conflict stages recovered source files, but an incomplete lockfile allowed a subsequent install to resolve newer dependencies. Generation then failed because platform-node-shared 4.0.0 imported an Effect module absent in the pinned prerelease.

## Cost / impact

The agent restored conflict stages, reapplied bounded resolutions, restored the current-main lockfile, and repeated dependency installation and generation. No damaged tree was committed or pushed.

## Outcome

Frozen-lockfile installation passed after restoring the current-main lockfile. Generation was restarted against that dependency state.

## Evidence

The first generation failed with ERR_MODULE_NOT_FOUND for effect/dist/process/ChildProcess.js. The subsequent frozen-lockfile installation exited successfully.
