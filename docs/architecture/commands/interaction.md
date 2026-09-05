---
type: Architecture
status: stable
description: How every command declares its interaction capabilities, when AXM may prompt, what preview and pre-approval mean, which conditions can be approved in advance and which only interactively, and how a refused approval names its recovery.
depends-on:
  - ./overview.md
  - ./output.md
  - ./terminal-design.md
  - ../workspace/sources.md
---

# Interaction

AXM asks a question only when a person can answer it and the answer changes
what the command does. Every other path is deterministic: the command either
has what it needs or fails naming what is missing. Which questions a command
can ask, and which of them can be answered in advance, is declared beside the
command rather than inferred from its flags.

## Responsibilities

This document owns the interaction contract: the capability declaration every
command carries, the flags that declaration may expose, the conditions under
which a prompt may open, the meaning of `--preview`, `--yes`, and
`--non-interactive`, the distinction between conditions that can be approved
in advance and conditions that require an interactive answer, the shape of a
refused approval's recovery, and the relationship between a prompt and the
live frame.

## Non-responsibilities

It does not own the prompt widgets, the risk conditions a given planner
attaches, or the effect of any one command; command definitions, the prompt
module, and each planner own those. The obligations it explains belong to the
executable specifications named below, indexed by the
[specification catalog](../../../specifications/catalog.md), and are not
restated here as rules.

## Capability declarations

Every registered command node — the root, each group, and each leaf — declares
its interaction capabilities beside its definition: whether it can assess its
change without applying it, which single documented confirmation it can
approve in advance, which interactive-only trust conditions it can meet, how
it resolves its inputs, and what persistent state it changes. The flags that
express a capability are built only from that declaration, so a command cannot
register `--preview` or `--yes` without the capability that gives the flag its
meaning, and an architecture specification compares every node's declaration
with its parsed flags and its executable evidence
(`system/architecture/every-command-declares-interaction-capabilities`).

`--preview` is the one spelling of assessment
(`cli/preview-uses-the-canonical-flag`). Every command that can plan a change
exposes it: workspace lifecycle, authoring, publish, sync, setup, demote, and
the executable upgrade. A preview reports the exact candidate — including one
the command would refuse to apply — and changes no protected state. Each
preview route carries its own `preview-is-pure` specification under
`specifications/cli/<command>/`.

`--yes` (`-y`) is exposed only where a command declares one documented
confirmation it can approve in advance
(`cli/confirmation-flags-have-a-supported-purpose`). Three commands do:

- `demote` approves replacing workspace source authority with the externally
  sourced package, the confirmable condition its plan always carries;
- `setup` applies the documented unattended defaults together with an
  explicit scope and explicit agents;
- `login` starts a new sign-in although a valid session already exists.

Every other command exposes no `--yes`. Its ordinary plans carry no
confirmable condition and apply without a prompt, and the conditions it can
meet are interactive-only, so no flag could approve them. Read-only commands
expose neither flag, because they neither assess nor confirm.

## Selection and approval

Two kinds of question exist, and they answer to different inputs.

A **selection** gathers input the command has no other source for: which
coding agents to configure during setup, which skills or subagents to install
from a package that offers several, or the answers workspace initialization
collects. Selection is replaced by flags and arguments, never by `--yes`. A
command whose inputs resolve to documented defaults uses them in preview and
in unattended apply alike; a command whose inputs require an explicit choice
fails naming the missing flag when no prompt can open.

An **approval** answers whether to apply a plan that carries a confirmable
risk condition. It is asked after the plan is presented and before the
workspace transition is acquired, so what is approved is exactly what will
apply. Approval is required only when the apply has work to do and its plan
carries at least one confirmable condition
(`cli/confirmation-is-required-only-for-actionable-risk`); an explicit,
eligible mutation applies without a redundant prompt.

## Preview precedes approval

A preview is speculative. It confirms nothing, consumes no approval, and
grants none to a later invocation. On the commands that expose both flags,
`--preview` with `--yes` yields the same candidate as `--preview` alone and
opens no prompt (`cli/preview-does-not-consume-approval`). Setup preview
resolves the same documented defaults an unattended apply would use and
reports them, so what is previewed is what `--yes` would apply
(`cli/setup/preview-resolves-inputs-without-prompts`).

## Effective interactivity

A prompt may open only when the invocation is interactive and machine output
is off. The CLI is non-interactive when `--non-interactive` is given, and
otherwise when `CI` is set or standard input is not a terminal; the explicit
flag wins over environment detection in both directions. Machine output is an
absolute prohibition: a `--json` invocation never prompts, even from a
terminal (`cli/machine-mode-never-prompts`). Planning, approval, and the
screen read one resolution of these inputs, so they agree on whether a
question can be asked.

A prompt that cannot open does not silently choose. A missing selection ends
the command with a usage failure naming the flag that supplies the answer. A
missing approval ends the operation as blocked, described below. Cancelling a
prompt is an answer: a cancelled approval is declined and applies nothing; a
cancelled selection ends the command with the cancelled outcome and changes no
state.

## Preapprovable and interactive-only conditions

A confirmable condition is either preapprovable or interactive-only, and the
command's declaration fixes which.

A **preapprovable** condition is the one documented confirmation a command's
`--yes` approves. With `--yes` the apply proceeds; without it the command
prompts when a prompt can open and otherwise blocks naming the flag.

An **interactive-only** condition can be approved only by a person at a
prompt. No flag approves it in advance, and a command that offers no `--yes`
treats every confirmable condition it meets this way. When a prompt can open,
the command asks; when it cannot, the operation blocks and names the
interactive route — never a flag the command does not accept.

A risk condition may instead require a named policy override. Then no prompt
and no consent flag satisfies it: the operation blocks naming the flag, and
`cli/force-bypasses-only-named-policies` owns what that flag may bypass.
Publishing content whose archive differs from Git HEAD is one such condition
(`cli/publish/requires-explicit-acceptance-for-non-head-source`); release-age
and version-constraint exceptions are others. Consent and policy stay
independent: `--yes` never substitutes for a named override, and an override
never grants approval.

## Publisher trust

An install or update whose Registry resolution replaces an accepted binding
with a different publisher for the same owner and name is a trust decision,
not a routine confirmation. The plan carries it as an interactive-only
condition, preview reports it, and only an interactive approval lets the apply
proceed (`cli/publisher-changes-require-interactive-approval`). Unattended and
machine invocations block with the interactive recovery. Accepting a binding
for the first time is not a change.
[Sources and resolution](../workspace/sources.md) owns the binding itself.

## Setup and login

`setup` initializes an absent scope. Its preview resolves inputs without
prompting and reports the documented defaults it would apply. An unattended
apply — non-interactive, machine, or `--yes` — writes only with `--yes`, an
explicit `--scope`, and at least one explicit `--agent`; anything less ends
with the stable reason `approval-required` and writes nothing
(`cli/setup/unattended-apply-requires-explicit-intent`). An interactive setup
without `--yes` collects the same inputs at prompts. Rerunning setup on an
initialized scope never changes agent membership.

`login` asks one non-plan question: whether to sign in again when a valid
session already exists. Interactively it asks; `--yes` answers it in every
mode, starting a new supported sign-in flow even under `--json` or
`--non-interactive` (`cli/login/preapproval-requests-new-sign-in`). Without
`--yes`, a valid session in a mode that cannot prompt is a successful no-op
whose suggestions name `axm login --yes` for signing in as a different
account.

## Recovery from a refused approval

When approval is required and cannot be obtained, the operation resolves as
blocked in the confirmation phase with the class "approval required", and
nothing is applied. The recovery it names is always valid for the command that
produced it (`cli/approval-required-names-a-valid-recovery`):

- for a preapprovable condition, the same invocation with `--yes` appended,
  rendered with its scope and explicit global flags so it can be replayed as
  written;
- for an interactive-only condition, the same invocation with `--json` and
  `--non-interactive` removed, so it can be rerun in a terminal where the
  prompt can open — never a `--yes` the command does not accept.

When the original arguments contained a protected or unclassified value, such
as a credential-bearing locator, the recovery is a description of the rerun
and no command is rendered. Machine output carries the same blocked resolution
and the same recovery as suggestions. A declined approval resolves as
cancelled with no changes applied.

## Prompts and the live frame

A prompt takes the terminal from the live frame. The frame erases its live
region, pauses repainting, runs the prompt, and resumes when the prompt
returns, so a question is never painted over a spinner and a spinner never
erases a question. In machine mode there is no frame to yield and no prompt
reaches the terminal.
