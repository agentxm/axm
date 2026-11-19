---
type: Pattern
title: "Focus filter"
description: "When an operation has several applicable aspects, let the caller choose which ones to examine within the selected scope."
tags: ["skills", "arguments", "filter", "aspects", "review", "multiple values"]
status: draft
sources:
  - id: review
    resource: https://github.com/anthropics/claude-plugins-official/blob/4d9854e0873b9d068fb444c8b14d00278ce2402a/plugins/pr-review-toolkit/commands/review-pr.md
    title: Anthropic PR review command
---

# Focus filter

Anthropic's PR review command accepts review aspects such as `tests errors`
together. Omitting the aspects runs the applicable reviews.[^review] The
target stays the same as the caller changes the questions asked about it.

For a package reviewer, `/package audit ./checkout --focus links` can check
links inside checkout. If the same caller also selects metadata, define
whether the two values accumulate. In this example the reviewer performs
both checks independently. Show the same choice in ordinary language:
“Check links and metadata in checkout.”

Use a [scope selector](scope-selector.md) when a value identifies a different
object. Use a filter when it changes coverage of the current object. A
[named option](named-option.md) is one way to express that filter. For a skill
with just a few familiar aspects, the aspect words alone may suffice.

Try one aspect, two together, no filter, and an unknown aspect. Check the
actual coverage and what the report claims was examined. Silently treating an
unrecognized filter as “all” widens the review.

[^review]: Anthropic, available review aspects, default, and combined examples.
