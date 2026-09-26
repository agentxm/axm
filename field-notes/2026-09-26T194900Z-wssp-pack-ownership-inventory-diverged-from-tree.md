---
observed_at: "2026-09-26T19:49:00Z"
session: "wssp"
area: "workspace pack and MCP ownership refactor"
---

# Frozen pack ownership inventory did not match the tree

## Context

The agent session implemented the pack and MCP ownership decision in `packages/core/workspace`. The frozen text lists what moves out of `packs/authoring/` and names one file to delete.

## Friction

The decision says `packs/authoring/*` holds "5 specs and 3 tests". The tree held 7 specs and 4 tests. Two of the specs are `new-pack-*` specs for the create use case, and the fourth test is `configured-pack-selector.test.ts`. The decision also names `packs/lifecycle/operations/install.ts` and its test for deletion, but an earlier commit on the branch had already deleted them.

## Cost / impact

The agent listed the folder and read git history before moving anything, and had to choose which of the unlisted files to move. No verification round failed because of it.

## Outcome

The 5 membership specs and all 4 tests moved with their subjects to `authoring/pack-membership/`. The two `new-pack-*` specs stay in `packs/authoring/` for the later test-relocation step, whose plan lists them among the create specs. The deletion was skipped because the file no longer existed.

## Evidence

`git ls-files packages/core/workspace/src/packs/authoring` before the move. The D6 commit `edc20c6ce` says "The unused installPack operation and its test are deleted."
