# Guides

Guides provide high-level overview and orientation for key topics. They collect
references to important resources, skills, and background that contextualizes
the topic to this project. Use guides as topic-based entry points for subjects
too detailed for README.md or CLAUDE.md, but not tactical enough for skills.

---

## Quality Checklist

- [ ] **Entry point** — Topic warrants a dedicated starting point for orientation
      → If minor, fold into existing guide; if directory-scoped, use README
- [ ] **High-level** — Overview and context, not step-by-step instructions
      → If tactical patterns or checklists, use a skill
- [ ] **References CLAUDE.md** — Links to relevant CLAUDE.md section for critical guidance
      → Guides must not duplicate CLAUDE.md; assume reader understands linked guidance
- [ ] **Collects references** — Aggregates resources, skills, and background
      → If nothing to collect, content may belong inline or in CLAUDE.md
- [ ] **Project-specific** — Contextualizes how the topic applies here
      → If generic, link to external docs rather than duplicating

---

## Template

```markdown
# Guide Title

Purpose statement explaining what this guide covers and why it matters.

> **Critical guidance:** [Section Name](../../CLAUDE.md#section-anchor) <!-- required if CLAUDE.md covers this topic -->

## Key Resources <!-- omit if none -->

- [Official Docs](https://example.com) — Authoritative reference
- [Related Guide](./related-guide.md) — Essential context

## Skills <!-- omit if none -->

- `/skill-name` — What this skill provides

---

## [Topic Sections] <!-- required -->

Context explaining _why_ this topic matters and what decisions it informs.

---

## See Also <!-- omit if none -->

- [Notable Article](https://example.com) — Influential writing on the topic
- [Deep Dive](https://example.com) — Further exploration
```
