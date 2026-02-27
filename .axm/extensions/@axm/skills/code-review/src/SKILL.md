---
name: code-review
description: Review code using project guidance and suggest improvements. Use when reviewing code changes, PRs, or implementations.
user-invocable: true
---

# Code Review

Review code changes against project conventions and suggest improvements.

---

## Process

1. **Identify scope** — Determine what to review:
   - Staged changes (`git diff --cached`)
   - Unstaged changes (`git diff`)
   - Specified files or paths (if provided by user)
   - Recent commits (if requested)

2. **Consult guidance** — Check relevant project conventions:
   - `CLAUDE.md` for project-wide rules
   - `contributing/guides/` for domain-specific guidance (Effect, testing, CLI design)
   - `.claude/skills/` for pattern-specific skills (errors, schemas, services)
   - Co-located `CLAUDE.md` files in affected directories

3. **Review and report** — For each finding:
   - **File and location** — Where the issue is
   - **Category** — What convention or best practice applies
   - **Suggestion** — Concrete improvement with rationale

---

## Review Checklist

- [ ] **Skills** — Code conforms to guidance in all relevant `.claude/skills/`
      → Load applicable skills and check each convention
- [ ] **Agent instructions** — Code conforms to all relevant `CLAUDE.md` guidance
      → Check root and co-located `CLAUDE.md` files in affected directories
- [ ] **Guides** — Code conforms to all relevant guidance in `contributing/guides/`
      → Consult domain guides (Effect, testing, CLI design, etc.)

---

## Output Format

```
## Code Review

### Summary
[1-2 sentence overview of changes and overall quality]

### Findings
- **file:line** — [Category] Description of issue
  → Suggested fix

### Commendations
[Notable positive patterns worth highlighting]
```

---

## Guidelines

- Prioritize findings by impact: correctness > safety > conventions > style
- Be specific — reference exact lines and suggest concrete fixes
- Acknowledge good patterns, not just problems
- Skip nitpicks unless asked for thorough review
- If no issues found, say so clearly
