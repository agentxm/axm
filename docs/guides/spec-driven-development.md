# Spec-Driven Development

End-to-end workflow for planning, specifying, and implementing features through
OpenSpec proposals and beads task execution.

> [Spec-Driven Development](../../CLAUDE.md#spec-driven-development) — critical guidance

## Skills

| Skill                 | Purpose                              |
| --------------------- | ------------------------------------ |
| `/openspec:proposal`  | Create a new change proposal         |
| `/openspec:archive`   | Archive after deployment             |
| `/beads-plan`         | Create beads from markdown task plan |
| `/beads-execute-plan` | Execute plan phases with sub-agents  |
| `/beads-close-phase`  | Close phase epic and sync markdown   |

> **Do not use `/openspec:apply`.** Use `/beads-plan` and `/beads-execute-plan`
> to implement spec proposals.

## Key Resources

- [OpenSpec Agent Instructions](../../openspec/AGENTS.md) — Complete OpenSpec reference
- [Beads Guide](./beads.md) — Task plan format and execution workflow

---

## Workflow

```
1. CREATE PROPOSAL     /openspec:proposal <description>
        ↓
2. ITERATE PROPOSAL    Edit proposal.md
        ↓
3. ITERATE DESIGN      Edit design.md
        ↓
4. UPDATE TASKS        Edit tasks.md (TASK-N.M format)
        ↓
5. COMMIT              Validate, commit, get approval
        ↓
6. EXECUTE             /beads-plan → /beads-execute-plan
        ↓
7. ARCHIVE             /openspec:archive <change-id>
```

---

## See Also

- [OpenSpec AGENTS.md](../../openspec/AGENTS.md) — Full OpenSpec reference
- [Beads Guide](./beads.md) — Task format and execution details
- [What Makes a Good Spec?](https://addyosmani.com/blog/good-spec/) — Addy Osmani on spec quality
