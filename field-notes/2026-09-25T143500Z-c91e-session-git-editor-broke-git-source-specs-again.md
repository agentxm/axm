---
observed_at: "2026-09-25T14:35:00Z"
session: "c91e"
area: "local verification: agent session environment"
---

# The session GIT_EDITOR again failed Git-source specs unrelated to the change

## Context

Running focused workspace specs around an install-classification change in
`axm`; none of the change touched Git-source code.

## Friction

`pack-source-switches-are-member-diffed.spec.ts` (2 examples) and
`advances-resolution-within-intent.spec.ts` (2 examples) failed with
`GitOperationFailed: Failed to shallow clone git://127.0.0.1:.../toolkit.git`,
caused by `Use of "GIT_EDITOR" is not permitted without enabling
allowUnsafeEditor`. The session exports `GIT_EDITOR=true`.

## Cost / impact

One focused run misattributed to the change until the cause string was read;
subsequent verification runs had to be prefixed with `env -u GIT_EDITOR`.

## Outcome

Verification continued with `env -u GIT_EDITOR` in front of every test
command.

## Evidence

- `echo $GIT_EDITOR` in the session prints `true`.
- Same failure was recorded earlier by another session in
  `field-notes/2026-09-25T114500Z-mq22-session-git-editor-broke-git-source-tests.md`.

## Existing context

The earlier note records that rerunning the failing files with
`env -u GIT_EDITOR` made them pass; that remedy was reused here without
re-verifying the cause.
