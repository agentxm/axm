# Synthetic managed instruction projection

`AGENTS.md` is the canonical source. AXM owns `CLAUDE.md` as a projection and
documents `axm sync --preview` followed by `axm sync` as its reconciliation
mechanism.

Both files currently say to run `task verify-old`. The repository task list
shows that command was replaced by `task verify`. A collaborator manually
changed only `CLAUDE.md`, so the projection now differs from `AGENTS.md`.

No other instruction is stale.
