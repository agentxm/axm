# Guides

Guides provide high-level overview and orientation for key topics. They collect
references to important resources, skills, and background that contextualizes
the topic to this project. Use guides as topic-based entry points for subjects
too detailed for README.md, AGENTS.md, or CLAUDE.md, but not tactical enough
for skills.

## Structure

Each guide is a single markdown file named after its topic:

- `effect.md` — Effect patterns for typed errors, services, and async
- `effect-option.md` — When to use `Option` versus nullable values
- `effect-v4-quick-ref.md` — Common v3 to v4 API renames and migrations
- `testing.md` — Testing orientation and skill references
- `cli-design.md` — CLI architecture and conventions
- `spec-driven-development.md` — SDD workflow with OpenSpec
- `feature-delivery.md` — Proposal, design, and implementation checks
- `typescript-style.md` — Assertion-free TypeScript and narrowing patterns
- `documentation-guidelines.md` — Writing rules for human and agent docs
- `guide-authoring.md` — When and how to add a guide here
- `instructions.md` — README vs CONTRIBUTING vs AGENTS/CLAUDE vs SKILL docs
- `agent-accessibility.md` — Keeping install and skill docs aligned with real behavior

---

## Quality Checklist

- [ ] **Entry point** — Topic warrants a dedicated starting point for orientation
      → If minor, fold into existing guide; if directory-scoped, use README
- [ ] **High-level** — Overview and context, not step-by-step instructions
      → If tactical patterns or checklists, use a skill
- [ ] **Links AGENTS.md/CLAUDE.md** — Links to the relevant section when one exists
      → Don't duplicate root instructions; link to critical guidance instead
- [ ] **Collects references** — Aggregates resources, skills, and background
      → If nothing to collect, content may belong inline or in CLAUDE.md
- [ ] **Skills index** — Lists related skills with file path, command, and description
      → Use table format; include slash command only if user-invocable
- [ ] **Project-specific** — Contextualizes how the topic applies here
      → If generic, link to external docs rather than duplicating

---

## Template

```markdown
# Guide Title

Purpose statement explaining what this guide covers and why it matters.

> [Section Name](../../AGENTS.md#section-anchor) - critical guidance <!-- use AGENTS.md or CLAUDE.md when relevant -->

## Key Resources <!-- omit if none -->

- [Official Docs](https://example.com) - Authoritative reference
- [Related Guide](./related-guide.md) - Essential context

## Skills <!-- omit if none -->

| Skill                                       | Command       | Description               |
| ------------------------------------------- | ------------- | ------------------------- |
| [skill-name](../../path/to/owning/SKILL.md) | `/skill-name` | What this skill provides  |
| [other-skill](../../path/to/other/SKILL.md) | —             | Supporting patterns for X |

---

## [Topic Sections] <!-- required -->

Context explaining _why_ this topic matters and what decisions it informs.

---

## See Also <!-- omit if none -->

- [Notable Article](https://example.com) - Influential writing on the topic
- [Deep Dive](https://example.com) - Further exploration
```
