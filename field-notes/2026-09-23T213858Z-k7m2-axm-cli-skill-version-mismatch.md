---
observed_at: "2026-09-23T21:38:58Z"
session: "k7m2"
area: "AXM instruction verification"
---

# AXM CLI version did not match the repository skill

## Context

The repository's canonical `AGENTS.md` was revised for the local verification
policy, and AXM lint was used to check instruction state in the new worktree.

## Friction

`pnpm exec axm lint --json` reported that the available AXM CLI was 0.33.1,
outside the repository skill's required `>=0.34.0 <0.35.0` range. The new
worktree also lacked its ignored `CLAUDE.md` alias.

## Cost / impact

AXM instruction convergence could not be verified with the available CLI.
Repository `verify:affected` and the OKF validator passed independently.

## Outcome

The canonical instruction edit remains in the worktree. No executable upgrade
or AXM sync was performed.

## Evidence

AXM lint reported `cli-version-incompatible` with `cliVersion: 0.33.1` and
`skillVersion: 0.34.0`.
