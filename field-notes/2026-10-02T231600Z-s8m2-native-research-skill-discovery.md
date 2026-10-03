---
observed_at: "2026-10-02T23:16:00Z"
session: "s8m2"
area: "Codex native researcher smoke test"
---

# Installed Research Skill omitted from host discovery

## Context

A read-only Codex CLI smoke test delegated one framing phase to the native researcher role in an isolated worktree.

## Friction

The first child returned blocked because the Research Skill and its framing reference were absent from host discovery. A second invocation confirmed the intended working directory and a valid `.agents/skills/research` symlink with readable Skill content, while its host catalog still omitted Research.

## Cost / impact

The smoke test required a second invocation and filesystem discovery checks.

## Outcome

The second native researcher delegation returned a complete bounded Research Brief. The reason for the host catalog omission remains unestablished.
