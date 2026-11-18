---
type: Guide
title: "Authoring scoped instructions"
description: "Place an instruction at the scope where it applies and check what neighboring tasks inherit."
tags: ["instructions", "rules", "agents.md", "claude.md", "scope", "precedence"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:24:31Z" }
---

# Authoring scoped instructions

Keep an instruction where the host will load it for the work it governs.
A repository-wide invariant belongs at the root. A build command that applies
only to one package can live with that package. A long repair procedure can
live in a guide, with a short pointer where an agent would encounter the failure.

Suppose only the website regenerates a search index. Open a website task and
check that its effective instructions lead to the generator. Then open a
neighboring CLI task. If it also regenerates the index, move the instruction
to the narrower scope supported by the host.

Check the host's actual loading and precedence rules, including imports and
managed regions. When shortening a parent file, follow the remaining route from
a fresh task. Removing a repeated procedure can also remove the only way an
agent discovers it.
