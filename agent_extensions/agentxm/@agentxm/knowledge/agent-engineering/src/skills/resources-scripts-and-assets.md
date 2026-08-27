---
type: Reference
title: References, scripts, and assets
description: How to assign supporting material by semantics, contain generated files, and preserve clean distribution boundaries.
tags: [agent-skills, references, scripts, assets, resources, generated-files, gitignore, packaging]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-27T03:10:49Z }
stale_after: 2027-02-22
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
  - id: gitignore
    resource: https://git-scm.com/docs/gitignore
    title: Git — gitignore documentation
  - id: python-compiled-files
    resource: https://docs.python.org/3/tutorial/modules.html#compiled-python-files
    title: Python — Compiled Python files
---

# References, scripts, and assets

Optional directories exist to serve different semantics. Create only the
resources the workflow actually needs.[^agent-skills-spec]

| Need | Artifact | Design obligation |
| --- | --- | --- |
| Conditional facts, schemas, policies, or detailed examples | `references/` | Focus the file and route to it from the relevant step |
| Exact repeated mechanics | `scripts/` | Declare inputs, dependencies, outputs, side effects, errors, and tests |
| Templates or material copied into outputs | `assets/` | Preserve licensing and distinguish output material from instructions |

## Script quality

A bundled script should be self-contained or explicit about dependencies, safe
by default, scoped to resolved targets, non-interactive for automation, useful
on failure, and testable outside the conversation. Instructions must say when
to run it and how to interpret its result.

Do not replace judgment with code merely to appear deterministic. Do not leave
repeated fragile transformations as prose merely to avoid maintaining code.

Trial evidence is the cheapest signal for what belongs in `scripts/`. When
independent runs each improvise the same helper or repeat the same fragile
sequence, the skill should ship it once rather than pay for its rediscovery on
every invocation.[^anthropic-skill-creator]

## Generated files and distribution boundaries

Prefer helpers that write disposable state to declared output or temporary
locations. When ordinary execution can create disposable files inside an
extension that may be consumed in a Git worktree, ship minimal ignore rules at
the extension root; do not assume the consuming repository configured them.

| Control | Purpose |
| --- | --- |
| Runtime behavior | Avoid or redirect generated files |
| Extension-root `.gitignore` | Keep unavoidable residue out of consumer Git changes |
| Package filtering | Keep residue out of release archives |

Keep rules specific to artifacts the extension generates. Use a nested ignore
file only when that subtree is distributed independently. Verify each
applicable control and that required dotfiles survive packaging and
projection.[^gitignore] For Python helpers that can create bytecode caches, use:

```gitignore
__pycache__/
*.py[cod]
```

Python creates these caches automatically for imported modules.[^python-compiled-files]
The ignore file is justified package metadata when this condition applies; it
does not prevent cache creation or filter a release archive.

## Resource quality

- Use synthetic fixtures, portable paths, and declared dependencies.
- Keep only authoritative, used resources; omit placeholders, empty
  directories, duplication, and habit-added prose.
- Review every packaged byte; non-`SKILL.md` content can still execute, leak,
  mislead, violate redistribution rights, or dirty a consumer worktree.

[^agent-skills-spec]: Agent Skills specification
[^anthropic-skill-creator]: Anthropic — Skill Creator
[^gitignore]: Git — gitignore documentation
[^python-compiled-files]: Python — Compiled Python files
