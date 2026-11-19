---
type: Guide
title: "Authoring and revising skills"
description: "Design or revise a skill from a concrete use case, including how it gets invoked and how it chooses a procedure."
tags: ["skills", "skill.md", "author", "revise", "routing", "progressive-disclosure"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T00:52:33Z" }
sources:
  - id: arguments
    resource: https://code.claude.com/docs/en/skills#pass-arguments-to-skills
    title: Claude Code skill arguments
  - id: specification
    resource: https://agentskills.io/specification
    title: Agent Skills specification
  - id: writing
    resource: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/writing-skills/SKILL.md
    title: Superpowers writing skills
  - id: example
    resource: https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices/rules/async-defer-await.md
    title: Vercel React best practices worked example
---

# Authoring and revising skills

Start with one use case. Write it in three lines.

- **Request.** “Can someone who installs this skill follow its migration-guide link?”
- **Input.** The release-note skill archive the consumer receives.
- **Inspectable result.** The exact reference and a verdict grounded in the archive listing.

The same example can introduce the skill in its [README](authoring-readme.md)
and supply the first execution trial. To design how it gets invoked, choose
the decisions that matter for this use case.

1. Choose an [invocation policy](../patterns/invocation-policy.md). For this reviewer,
   a named shortcut and an ordinary request can both lead to the same read-only review.
2. Put recognizable [trigger cues](../patterns/trigger-cues.md) in the description.
   Here the requested consumer check and the package artifact identify the job.
3. Try a [neighboring intent](../patterns/neighboring-intent.md). A request to
   repair the link changes the deliverable and the authority required.
4. [Route after inspection](../patterns/route-after-inspection.md) when the
   procedure depends on the evidence supplied. An archive can establish whether
   a path exists. An excerpt warrants a narrower verdict.

In the body, spell out decisions where a plausible choice would produce the
wrong result. Give exact steps when order matters and link a specialized
reference at the step that needs it. Try an [invocation trial](../patterns/invocation-trial.md)
when selection is uncertain.

## Write the invocation signature

Describe the work in terms the caller can supply. For a package reviewer, the
short form might be `/package [operation] [scope]`. Brackets mark optional
inputs in this guide. Use `<scope>` when the caller must supply a target.
Show actual requests alongside the notation.

For a target that names an existing object, say which kinds of object it can
denote, which inventory resolves it, and how the caller can qualify it. Put
the zero-, one-, and multiple-match decisions in the skill body where it
first interprets the request. This lets the agent resolve the target before
it promises a particular review or opens a target-specific guide. A proposed
name in a creation brief has a different role.

- `/package` offers orientation. `/package ./checkout` inspects checkout.
  `/package audit ./checkout` produces a findings report. Choose an
  [operation selector](../patterns/operation-selector.md) for the verb and a
  [scope selector](../patterns/scope-selector.md) for the target. Define the
  [contextual default](../patterns/contextual-default.md) for each omission.
- `/package audit ./checkout --focus links` asks the same question as
  “audit the checkout package for broken links.” A [focus filter](../patterns/focus-filter.md)
  narrows coverage. A [named option](../patterns/named-option.md) makes the
  control explicit. A [free-form brief](../patterns/free-form-brief.md) can
  carry constraints such as “include the link text so the editor can find it.”

Use positional arguments when their roles and order are easy to remember.
Claude Code illustrates this with `/migrate-component SearchBar JavaScript TypeScript`:
component, source language, destination language. In Claude Code,
`argument-hint` advertises a signature during completion. The skill body can
receive the argument text through `$ARGUMENTS` or address positions such as
`$0`. These are host conventions. Document the meaning of the inputs in the
portable skill body and check binding on each host that the skill supports.[^arguments][^specification]

## Design and revise the result

Decide what the reader must do with the result. An archive review can use a
[display template](../patterns/display-template.md) to distinguish clean,
broken, and unverified references. When the reader must decide how to act,
design the report and the reply together. Offer
[selectable next actions](../patterns/selectable-next-actions.md) after the
result. Let the reader [select from findings](../patterns/select-from-findings.md)
to specify which items an action affects. Carry that
selection in a [workflow handoff artifact](../patterns/workflow-handoff-artifact.md)
when another session will do the repair. A [prefilled form](../patterns/prefilled-form.md)
fits a partly known brief. To settle a preference about the output, let the
reader [compare variants in context](../patterns/compare-variants-in-context.md).

Try the [review template](reviewing-extensions.md#report-the-review) in plain
text with a fresh reader. Can they locate recommendation 2 and request just
that repair? On identical fixtures, exercise the picker and the short reply,
then check the actual edit. Try a clean result and an excerpt with missing
evidence to see whether the skill closes or asks for the right input.

Before revising a skill, find where an actual run went wrong.[^writing] If
the agent never opened the review guide, examine the routing cue. If it read
the guide, found the defect, and omitted the repair location, change the example
or add a location field to the finding. When it took the wrong branch, name
the observable condition that distinguishes the two routes.

A pair of examples can isolate the missing detail.[^example] “The migration
link is broken” gives the editor a symptom. “In the authored `SKILL.md`, change
`migration.md` to the shipped filename `migrations.md`” gives the editor a
place to act. Retry the original task and a fresh variant to see whether
the revision fixes that omission.

[^arguments]: Claude Code, argument hints and positional substitution.

[^specification]: Agent Skills, portable skill metadata and body.

[^writing]: Superpowers writing skills, selecting guidance for the observed failure.

[^example]: Vercel React best practices, paired examples for deferring an await.
