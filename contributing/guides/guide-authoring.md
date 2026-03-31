# Guide Authoring

How to decide whether a topic belongs in `contributing/guides` and how to
structure the result. Guides in this repo are high-level entry points: broader
than a package README, more stable than a tactical skill, and more focused than
root instructions.

## Key Resources

- [Guides README](./README.md) - Template and local conventions
- [Documentation Guidelines](./documentation-guidelines.md) - Shared writing
  rules

---

## When to Create a Guide

Create a guide when the topic is cross-cutting and contributors need an
orientation point.

Good fits:

- a repo-wide technical topic such as Effect, TypeScript, or testing
- a repeated workflow like feature delivery or documentation maintenance
- a subject that needs links to several resources, skills, or specs

Do not create a guide when:

- the content belongs to one package or directory README
- the content is a step-by-step workflow better captured in a skill
- the rule already lives clearly in AGENTS.md or CLAUDE.md

---

## Recommended Structure

Use the template in [README.md](./README.md).

Typical shape:

1. Title and purpose statement
2. Link to the relevant AGENTS.md or CLAUDE.md section when one exists
3. Key resources and related local guides
4. Optional skills table
5. Topic sections with project-specific context
6. Optional See Also links

Keep the guide high-level. If you start writing detailed procedures or command
playbooks, move that material into a skill or the owning instruction file.

---

## Quality Bar

Every guide should:

- explain why the topic matters in `axm`
- add context instead of duplicating root instructions
- link to authoritative sources instead of embedding long copied rules
- avoid internal-only repo references, product details, and private workflows
- update [README.md](./README.md) so contributors can discover it

---

## See Also

- [Instructions Guide](./instructions.md) - Document ownership
- [Documentation Guidelines](./documentation-guidelines.md) - Audience and flow
