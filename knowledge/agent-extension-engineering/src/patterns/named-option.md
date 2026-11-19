---
type: Pattern
title: "Named option"
description: "Give an optional control a name when its value would be unclear by position or callers need to set it precisely."
tags: ["skills", "arguments", "options", "flags", "validation", "defaults"]
status: draft
sources:
  - id: loop
    resource: https://github.com/anthropics/claude-plugins-official/blob/4d9854e0873b9d068fb444c8b14d00278ce2402a/plugins/ralph-loop/commands/ralph-loop.md
    title: Anthropic Ralph Loop command
  - id: setup
    resource: https://github.com/anthropics/claude-plugins-official/blob/4d9854e0873b9d068fb444c8b14d00278ce2402a/plugins/ralph-loop/scripts/setup-ralph-loop.sh
    title: Ralph Loop option handling
---

# Named option

Ralph Loop pairs a free-form task with named options for an iteration limit
and a completion phrase. Its setup script distinguishes an omitted limit from
a supplied limit with a missing or invalid value.[^loop][^setup]

For a report skill, a trailing `3` could mean a finding number, a scope, or
a maximum. A documented `--limit 3` can mean “display up to three findings.”
Say whether the limit applies to inspection or presentation. For this design
omission displays all findings, and an invalid limit asks for a positive
integer before producing a limited report.

Name controls callers need to vary independently. Every new flag adds
vocabulary. A fixed operation with one familiar operand may be clearer with
just that operand. When both prose and a flag are supported, try “show three
findings” alongside `--limit 3`. A contradictory request such as “show all”
with `--limit 3` needs a defined precedence or a focused question.

In a [CLI-backed skill](cli-backed-skill.md), use the owning tool's argument
validation for options it implements. A flag-shaped hint in a prompt alone
does not enforce a type, range, or default.

[^loop]: Anthropic, prompt and options shown in the command hint.

[^setup]: Ralph Loop setup, defaults and validation of the iteration limit.
