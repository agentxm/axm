---
observed_at: "2026-09-23T13:50:09Z"
session: "k8p4"
area: "public repository CI"
---

# Git checkout interruption test assumed the last Git argument was the destination

## Context

A public pull request passed the local `verify:pr` workflow before its hosted CI run.

## Friction

Hosted `Verify proposed change` failed one of 4,410 workspace tests. The checkout interruption test read the final argument of its fake `git` command as the temporary directory, but the observed argument was `.`. The test then compared `path.dirname(".")` with `/tmp`.

## Cost / impact

The required CI gate failed after an 11-minute-58-second job, requiring a test correction and another verification run.

## Outcome

The fake Git command now records its working directory when the destination argument is `.`. The focused 16-test Git operations suite passed locally; the updated pull request gate is pending.

## Evidence

GitHub Actions run `35868023140`, job `107204673458`; `src/resolution/sources/git/operations.test.ts` reported `expected '.' to be '/tmp'` at line 268 before the correction.
