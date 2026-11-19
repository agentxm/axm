---
type: Pattern
title: "Review the decisions an artifact makes"
description: "When reviewing a working extension, use its decisions and the applicable design guidance to discover issues, improvements, and pruning opportunities."
tags: ["review", "discovery", "issues", "improvement", "pruning"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T01:19:56Z" }
---

# Review the decisions an artifact makes

A skill can select the right package and still make the caller identify it twice.
A reviewer looking only for failures can miss that extra turn. Conversely, a
reviewer comparing a small skill with every pattern in the library can propose
a picker for a task that always has exactly one target.

**Candidate pattern.** Follow a representative request through the artifact
until the outcome depends on a decision. Who chooses the target? What runs on
a repeated event? What must the next reader know? Use the [guide index](../guides/index.md)
to find the relevant surface and the [pattern index](index.md) to find that
decision. Read the guidance that could change your judgment. Its examples can
reveal questions you would otherwise have missed.

Consider what breaks, what would make a successful task easier, and what
work could disappear while preserving the outcome. The same decision can
lead to different recommendations in different artifacts. For example, use
[Scope selector](scope-selector.md) and [Contextual default](contextual-default.md)
to walk through a package picker:

| Observed behavior                                                                 | Finding the case supports                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Two packages match a short name. The skill silently edits the first.              | **Issue.** Resolve the ambiguity before editing.                                                                  |
| The skill correctly pauses but asks only “Which package?”                         | **Improvement.** Show the matching qualified names so the caller can choose in one reply.                         |
| The caller supplied an exact path and must still choose that package from a list. | **Pruning.** Skip the picker for an exact path. Exercise the ambiguous short name to check that it still prompts. |

A hook raises different questions. The [hook guide](../guides/configuring-hooks-and-mcp.md)
prompts the reviewer to follow a duplicate delivery. If a repeated event
already sets the same value, that case can close cleanly. A separate event
ledger would add state and maintenance. The absence of a ledger alone gives
no reason to introduce one.

Use this approach for reviews that leave room for judgment. A narrow question
such as whether an archive contains a named file can finish at the archive
listing. Every additional lookup costs time. Retain a finding when the artifact
shows a consequence for the user or maintainer. To assess the candidate, compare
reviews of the same skill and hook with and without the method, including a
working case that earns a clean result. Check missed findings and unsupported
suggestions as well as what each review discovered.
