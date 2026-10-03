---
observed_at: "2026-10-03T13:03:28Z"
session: "h7p2"
area: "lock contract integration"
---

# Two changes allocated lock version 9 to different contracts

## Context

The accepted dependency graph change had completed its v8-to-v9 self-host recovery before rebasing onto current main.

## Friction

Main at `37d16f39f02cf0290e87e69a6b4fb3fb9868c30f` already used v9 for source-distribution support while retaining flat Pack members. The branch used v9 for complete Pack dependency declarations. The merged schema could not use that number to distinguish the two accepted formats.

## Cost / impact

The strict version, fixtures, generated artifacts, and self-host acceptance need another coordinated transition. The earlier successful recovery does not verify the integrated state.

## Outcome

The rebase was completed while preserving main's source-distribution changes. Source and fixtures now target v10; the main-derived v9 self-host lock was backed up outside the workspace. Generation and source-CLI reacceptance remain pending.
