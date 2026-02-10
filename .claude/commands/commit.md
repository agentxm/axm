---
description: Stage all changes and commit automatically
allowed-tools:
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git branch:*)
  - Bash(git log:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(pnpm format:*)
---

# Context

- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -5`
- Status: !`git status --short`

# Your Task

1. Run `pnpm format` to format all files (prevents pre-commit hook from modifying staged files)
2. Run `git add -A` to stage all changes
3. Run `git diff --cached` to see what will be committed
4. Generate a commit message following Conventional Commits format:

```
<type>(<scope>): <description>

[optional body explaining what and why]
```

**Types:** feat, fix, docs, style, refactor, perf, test, build, ci, chore

**Rules:**

- Imperative mood ("add" not "added")
- Subject line ≤50 chars
- Infer scope from file paths when clear
- Reference issue numbers if visible in diff

5. **Generate a contextual commit message:**
   - Review the conversation history to understand the task/goal behind these changes
   - Use conversation context to write a meaningful "why" in the commit body
   - If the conversation describes a specific feature, bug fix, or refactor, reflect that in the message

6. **Execute the commit immediately** using the generated message
