---
name: checklists
description: Checklist authoring for verifying satisfiable outcomes. Use when writing acceptance criteria, quality gates, review checklists, or any verification list.
user-invocable: false
---

# Checklist Authoring

Checklists verify quality criteria with actionable remediation guidance.

---

## Format

```markdown
- [ ] **Label** — Brief criterion description
      → Remediation if criterion not met
```

### Components

| Component   | Purpose                                 |
| ----------- | --------------------------------------- |
| `- [ ]`     | Checkbox for verification               |
| `**Label**` | Bold, 1-3 word criterion name           |
| `—`         | Em dash separator (not hyphen)          |
| Description | What to verify, keep to one line        |
| `→`         | Arrow introducing remediation           |
| Remediation | What to do if criterion fails, indented |

---

## Example

```markdown
## Quality Checklist

- [ ] **Key topic** — Important enough to warrant a dedicated entry point
      → If minor or narrow, fold into existing guide or README
- [ ] **Provides orientation** — High-level overview, not step-by-step instructions
      → If tactical patterns, use a skill
- [ ] **Has references** — Links resources, skills, and background
      → If nothing to reference, may not need a guide
```

---

## Checklist Checklist

- [ ] **Criteria are verifiable** — Each item can be checked yes/no
      → Rewrite vague criteria as concrete checks
- [ ] **Labels are scannable** — Bold labels summarize criterion in 1-3 words
      → Shorten label, move detail to description
- [ ] **Remediation provided** — Each criterion has an action if failed
      → Add arrow line with specific guidance
- [ ] **Single responsibility** — Each item checks one thing
      → Split compound criteria into separate items
- [ ] **Logical order** — Items flow from most to least important
      → Reorder so critical checks come first
