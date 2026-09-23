---
observed_at: "2026-09-23T22:39:36Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "workspace test target in an agent shell"
---

# Inherited GIT_EDITOR failed Git-backed lifecycle tests again

## Context

Ran `pnpm exec nx run workspace:test --args="src/lifecycle src/packs"` from an
agent shell that exports `GIT_EDITOR=true`, to check a constraint-resolution
change.

## Friction

Eight Git-backed tests failed before exercising their subject. `simple-git`
rejected clones with `Use of "GIT_EDITOR" is not permitted without enabling
allowUnsafeEditor`. Whether the change caused the failures could not be told
until the untouched baseline was run.

## Cost / impact

One focused run was repeated, plus one baseline run with the change stashed,
before the failures were known to be environmental.

## Outcome

The baseline failed the same way. Rerunning the same target with
`env -u GIT_EDITOR` passed 65 files and 692 tests. Later runs used that prefix.

## Evidence

Failing files: `src/lifecycle/install/git-discovery.test.ts`,
`src/lifecycle/install/locator-selection.test.ts`,
`src/lifecycle/install/pack-source-switches-are-member-diffed.spec.ts`,
`src/lifecycle/install/source-switches-are-previewed-and-atomic.spec.ts`.

## Existing context

`field-notes/2026-09-23T181802Z-r5t9-git-editor-blocks-simple-git-tests.md`
records an earlier occurrence of the same rejection.
