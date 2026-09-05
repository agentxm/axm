---
type: Architecture
status: stable
description: When AXM may prompt, what non-interactive mode and pre-approval mean, which operations require confirmation, how a refused confirmation names its recovery, and how the live frame yields to a prompt.
depends-on:
  - ./overview.md
  - ./output.md
  - ./terminal-design.md
---

# Interaction

AXM asks a question only when a person can answer it and the answer changes
what the command does. Every other path is deterministic: the command either
has what it needs or fails naming what is missing.

## Responsibilities

This document owns the interaction policy: the conditions under which a
prompt may open, the meaning of `--non-interactive` and `--yes`, the
operations that require confirmation, the shape of a refused confirmation's
recovery, and the relationship between a prompt and the live frame.

## Non-responsibilities

It does not own the prompt widgets, the flags a given command exposes, or the
risk conditions a given plan carries; command definitions, the prompt module,
and each planner own those. The obligations it projects belong to the
executable specifications named below and are not restated here as rules.

## When a prompt may open

A prompt opens only in interactive mode. The CLI is non-interactive when
`--non-interactive` is given, and otherwise when `CI` is set or standard input
is not a terminal. An explicit flag wins over environment detection in both
directions. Machine output mode prohibits prompts independently; the
executable specification `cli/machine-mode-never-prompts` owns that
obligation.

A prompt that cannot open does not silently choose. The command terminates
with a usage failure that names the prompt it needed and how to supply the
answer: a flag for the missing value, or removing `--non-interactive`. When
the answer would have been a plan confirmation, the failure is the operation's
own blocked resolution, described below.

Cancelling a prompt is an answer. A cancelled confirmation is treated as
declined; a cancelled selection ends the command with the cancelled outcome
and changes no state.

## Prompt kinds

Two kinds of prompt exist, and they answer to different flags.

A **selection** prompt gathers input the command has no other source for:
which coding agents to configure during setup, which skills or subagents to
install from a package that offers several, or free-text answers during
workspace initialization. Selection prompts are replaced by the corresponding
flags and arguments; `--yes` does not answer them, except that `setup` treats
`--yes` as a request for unattended defaults.

A **confirmation** prompt asks whether to apply a plan that carries a
confirmable risk condition. It appears after the plan has been presented and
before the workspace transition is acquired, so what is confirmed is exactly
what will apply. `--yes` (`-y`) pre-approves this confirmation and nothing
else.

## What `--yes` means

Plan-bearing lifecycle commands — install, update, uninstall, enable, disable,
the type-specific forms of those, pack membership and activation, agent
membership, workspace authoring commands that create or convert packages, and
publish — accept `--yes` to pre-approve the apply confirmation. Without it the
command prompts when it can and reports approval as required when it cannot.
With `--preview`, `--yes` has no effect: a preview is speculative, never
confirms, and never grants approval to a later invocation.

`sync` is the audited exception among plan-bearing commands. Its plans carry no
confirmable risk condition, it applies without confirmation, and it exposes no
`--yes`; its independent closures each settle on their own.

Read-only commands — list, view, lint, discover, knowledge retrieval, and
help — expose no `--yes`, because they confirm nothing.

`axm login` accepts `--yes` for one non-plan question: whether to sign in again
when a valid session already exists.

## What requires confirmation

Confirmation is required exactly when an apply has work to do and its plan
carries at least one confirmable risk condition. Today those conditions are:
replacing workspace authority with an externally sourced package
(`demote`), and an update whose new resolution changes a skill's or
subagent's publisher identity. Destructive commands such as uninstall and pack
removal present their plan and apply it; they confirm only when a planner
attaches a confirmable condition.

A risk condition may instead require a named override. Then no prompt can
satisfy it: the operation blocks naming the flag, and the executable
specification `cli/force-bypasses-only-named-policies` owns what that flag may
bypass. Publishing content whose archive differs from Git HEAD is one such
condition; `cli/publish/requires-explicit-acceptance-for-non-head-source`
owns it.

## Recovery from a refused confirmation

When confirmation is required and cannot be obtained, the operation resolves
as blocked in the confirmation phase with the class "approval required", and
nothing is applied. The resolution carries an escape: the same invocation
with `--yes` appended, rendered with its scope and explicit global flags so it
can be replayed as written. When the original arguments contained a protected
or unclassified value, such as a credential-bearing locator, the escape is a
description that says to rerun the original invocation with `--yes` and no
command is rendered. Machine output carries the same blocked resolution and
the same escape as suggestions.

A declined confirmation resolves as cancelled with no changes applied.

## Prompts and the live frame

A prompt takes the terminal from the live frame. The frame erases its live
region, pauses repainting, runs the prompt, and resumes when the prompt
returns, so a question is never painted over a spinner and a spinner never
erases a question. In machine mode there is no frame to yield and no prompt
reaches the terminal.
