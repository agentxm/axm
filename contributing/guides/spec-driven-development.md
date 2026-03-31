# Spec-Driven Development

End-to-end workflow for planning, specifying, and implementing features through
OpenSpec. Covers exploration and ideation, creating proposals, iterating on
artifacts, implementation, verification against specs, syncing delta specs, and
archiving completed changes.

> [Spec-Driven Development](../../CLAUDE.md#spec-driven-development) — critical guidance

## Skills

| Skill                                                                                      | Command              | Description                                   |
| ------------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------- |
| [openspec-onboard](../../.claude/skills/openspec-onboard/SKILL.md)                         | `/opsx:onboard`      | Guided onboarding walkthrough                 |
| [openspec-explore](../../.claude/skills/openspec-explore/SKILL.md)                         | `/opsx:explore`      | Think through ideas before or during a change |
| [openspec-new-change](../../.claude/skills/openspec-new-change/SKILL.md)                   | `/opsx:new`          | Create a new change proposal                  |
| [openspec-continue-change](../../.claude/skills/openspec-continue-change/SKILL.md)         | `/opsx:continue`     | Create the next artifact in workflow          |
| [openspec-ff-change](../../.claude/skills/openspec-ff-change/SKILL.md)                     | `/opsx:ff`           | Fast-forward through artifact creation        |
| [openspec-apply-change](../../.claude/skills/openspec-apply-change/SKILL.md)               | `/opsx:apply`        | Implement tasks from a change                 |
| [openspec-verify-change](../../.claude/skills/openspec-verify-change/SKILL.md)             | `/opsx:verify`       | Verify implementation matches artifacts       |
| [openspec-sync-specs](../../.claude/skills/openspec-sync-specs/SKILL.md)                   | `/opsx:sync`         | Sync delta specs to main specs                |
| [openspec-archive-change](../../.claude/skills/openspec-archive-change/SKILL.md)           | `/opsx:archive`      | Archive after deployment                      |
| [openspec-bulk-archive-change](../../.claude/skills/openspec-bulk-archive-change/SKILL.md) | `/opsx:bulk-archive` | Archive multiple changes at once              |

## Key Resources

- `openspec/specs/*/spec.md` — Accepted capability specs
- `openspec/changes/<change-id>/proposal.md` — Active change proposal
- `openspec/changes/<change-id>/design.md` — Active change design
- `openspec/changes/<change-id>/.openspec.yaml` — Change metadata

---

## Workflow

```
1. CREATE PROPOSAL     /opsx:new <description>
        ↓
2. ITERATE ARTIFACTS   /opsx:continue (or /opsx:ff for all at once)
        ↓
3. IMPLEMENT           /opsx:apply <change-id>
        ↓
4. VERIFY              /opsx:verify <change-id>
        ↓
5. ARCHIVE             /opsx:archive <change-id>
```

---

## See Also

- [Feature Delivery Guide](./feature-delivery.md) — Delivery checks that
  complement the OpenSpec workflow
- [What Makes a Good Spec?](https://addyosmani.com/blog/good-spec/) — Addy Osmani on spec quality
