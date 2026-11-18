---
type: Pattern
title: "Scoped instructions"
description: "When a direction applies to only part of a workspace, place it where the host loads it for that work."
tags: ["instructions", "rules", "agents.md", "claude.md", "scope", "precedence"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: root
    resource: https://github.com/agentxm/axm/blob/03a82fdd2a0aebeb8fb3f38c99afe303bfad77a0/AGENTS.md
    title: AXM repository instructions
  - id: local
    resource: https://github.com/agentxm/axm/blob/03a82fdd2a0aebeb8fb3f38c99afe303bfad77a0/docs/AGENTS.md
    title: AXM documentation instructions
  - id: vercel
    resource: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
    title: Vercel Next.js documentation evaluation
---

# Scoped instructions

A repository-wide rule belongs where every affected task can see it. A
direction specific to one package belongs at the narrowest scope the host
loads for that work. In AXM, the root instructions identify the documentation
profile, while the detailed rules for editing the documentation bundle live
under `docs/`.[^root][^local]

Check the boundary from both sides. For example, a website task should find its
search-index generator, while a neighboring CLI task should have no reason to
run it. Inspect the host’s actual loading and precedence rules, including
imports and managed regions.

Each new scope gives authors another place to look. If work starts outside the
directory and still needs the local guidance, leave a short pointer at that
entry point. Keep a shared instruction at the parent when the same rule applies
on both sides.

Also ask whether an agent working in the right directory would recognize the
need to look something up. In Vercel’s Next.js 16 evaluation, the default
documentation skill went unused in 56% of cases. A compact index in the
project instructions led to more successful tasks on that suite.[^vercel]
For a package with version-specific conventions, put the version and a pointer
to the canonical reference where work begins. Try an ordinary request that
doesn't name the convention. Record whether the agent found and applied it.
Repeat outside the package to check the cost of loading the pointer too broadly.

[^root]: AXM repository instructions, Invariants.

[^local]: AXM documentation instructions, Scope.

[^vercel]: Vercel, documentation discovery on its Next.js evaluation suite.
