---
observed_at: "2026-10-03T03:47:25.796196+00:00"
session: "s7q4"
area: "workspace integrity verification"
---

# Root lockfile interrupted the integrity cutover gate

## Context

The source-compatible distribution implementation changes materialized-tree integrity from v1 to v2.

## Friction

The affected gate rejected the repository's v8 lockfile, which still contained v1 digests. Nx stopped the remaining work, including an in-progress workspace-features suite. After assigning the new schema version 9, the documented backup/remove/sync-preview recovery failed with `routes unauthorized` for the configured Registry packs.

## Cost / impact

The affected gate ran for 13 minutes 50 seconds without completing. CLI tests passed, but the interrupted suite did not establish passing evidence.

## Outcome

The backed-up lockfile was restored after the failed preview. An offline source-library invocation then verified each of the 29 installed packages against its existing v1 digest before computing its v2 digest and writing the schema-validated v9 lockfile. Accepted versions and payloads were retained. No runtime backward-compatibility path was added.

## Evidence

`axm:lint-bundled-skill` reported `Expected a sha256-tree-v2 materialized-tree digest`. The recovery preview exited 6. The offline regeneration reported 29 verified packages; the lockfile diff changes only its version and tree digests.
