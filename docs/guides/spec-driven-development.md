# Spec-Driven Development

End-to-end workflow for planning, specifying, and implementing features through
OpenSpec proposals.

> [Spec-Driven Development](../../CLAUDE.md#spec-driven-development) — critical guidance

## Skills

| Skill                | Purpose                      |
| -------------------- | ---------------------------- |
| `/openspec:proposal` | Create a new change proposal |
| `/openspec:apply`    | Implement a change proposal  |
| `/openspec:archive`  | Archive after deployment     |

## Key Resources

- [OpenSpec Agent Instructions](../../openspec/AGENTS.md) — Complete OpenSpec reference

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
6. EXECUTE             /openspec:apply <change-id>
        ↓
7. ARCHIVE             /openspec:archive <change-id>
```

---

## See Also

- [OpenSpec AGENTS.md](../../openspec/AGENTS.md) — Full OpenSpec reference
- [What Makes a Good Spec?](https://addyosmani.com/blog/good-spec/) — Addy Osmani on spec quality
