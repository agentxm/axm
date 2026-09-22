---
type: Decision
status: stable
description: Shared document grammar and application-owned interactions accumulate a stable transcript while one active region owns terminal updates.
depends-on:
  - ./cli-output-view-model-and-terminal-ownership.md
  - ./cli-live-event-contract.md
  - ../commands/terminal-design.md
  - ../commands/interaction.md
---

# CLI ledger grammar and application-owned prompts

## Context and forces

The typed `Doc` tree, the one painter, the `Screen` and its live frame, and the
lifecycle event stream gave AXM one output architecture, but not one visual
grammar. Status and change glyphs each took two columns and nothing aligned
across node kinds. A plan printed as change rows, progress as an indented task
tree, and a result as a third shape, so scrollback held the same units several
times in different layouts. A long publish printed one sentence per fact.

Prompts escaped the painter entirely. Effect's `Prompt` widgets paint their own
marks, colors, and layout, erase by counting lines, and cannot take the
painter's glyph policy, ASCII mode, or width rules. Three custom widgets
already worked around this one widget at a time. Waiting on a person in a
browser — sign-in, device code, publish authorization, step-up verification —
printed paragraphs of instructions while polling ran under a generic progress
unit, so the terminal never showed that it was parked on a human.

The grammar must keep features free of terminal concerns, keep machine output
a separate schema-backed projection, keep the painter replaceable, read the
same at forty and two hundred columns, and survive resize.

## Accepted choice

Human output speaks one grammar with three parts.

1. **One gutter, two edges.** Every node that carries a mark paints it in a
   five-column gutter, and content aligned with a mark starts at column six.
   Unmarked titles, verdicts, labels, empty states, and hints stay at the
   margin. These two edges are the complete alignment system.
2. **Durable documents.** Plans and results use a ledger when several subjects
   need review or comparison. Scalars, single outcomes, and activity do not
   acquire a ledger merely because the command performs work. A review and its
   result may repeat identities because they answer different questions.
3. **One active region.** Meaningful context and dispositions accumulate in
   the transcript. Current activity or one foreground interaction occupies the
   only region that can be repainted. Once committed, content is never folded
   away or replaced by the final result.

Prompts are application-owned. A view describes a question as data — an `Ask`
of kind `Confirm`, `Choose`, `Input`, or `Pick` — and `Screen.ask` runs it. Each
kind is a pure reducer from state and key to state, submission, or
cancellation, and a pure view from state and terminal facts to a `Doc` painted
by the one painter. Effect's `Prompt` module is not used. Raw terminal input
stays with Effect's `Terminal.readInput`, which acquires raw mode as a scoped
resource and restores it on release, so AXM owns key interpretation but no
raw-mode code.

Waiting on a human is a `Screen` primitive. `Screen.wait` places a wait in the
scene, races the awaited effect against key input, and settles into one line.
Feature packages reach it through one presentation port whose cases carry
data, never wording.

Ink remains deferred. Its reconsideration clause asked for evidence that a
component renderer would reduce prompt complexity; reducers painted through
the existing painter reduce it without one.

This record amends and does not supersede
[CLI output view model and terminal ownership](cli-output-view-model-and-terminal-ownership.md)
and the [CLI live-event contract](cli-live-event-contract.md). The specifics
live with their owners: [Terminal design](../commands/terminal-design.md) owns
the gutter, ledger, glyphs, layout, and live scene;
[Interaction](../commands/interaction.md) owns when prompts and waits open;
[CLI output](../commands/output.md) owns channels; and
[Publish](../commands/publish.md) owns resuming an exact pending authorization.

Accepting authority: maintainer approval of the terminal grammar redesign.
Existing executable specifications continue to own observable obligations;
new obligations land as specifications with the changes that implement them.

## Rationale

The accepted architecture already had the right seams. A grammar expressed as
node vocabulary and painter constants holds everywhere the painter runs,
including ASCII mode and every width, without each view or prompt
re-implementing alignment. The ledger remains a reusable document grammar while the accumulated
transcript records how an operation reached its result.

A prompt painted through the painter inherits the gutter, key chips, glyph
policy, and resize-safe erase by construction. The existing selection widgets
were already reducers wrapped in string rendering, so the move deletes code
rather than adding a framework. Committing review and instructions before their controls lets a gate or
external-action wait interrupt work without replacing its context.

## Material alternatives

- **Keep Effect prompt widgets and restyle around them.** The widgets cannot
  take the gutter, ASCII policy, or answer-line collapse, and their line-count
  erase breaks on resize. Rejected.
- **Adopt Ink for prompts and the live region.** A component tree would give a
  scene, but would make feature views depend on one framework and duplicate
  the painter's width and glyph rules. Rejected for now.
- **Use the full ledger as the live progress region.** Rejected by the
  transcript amendment below: bounded folding and final repainting break
  continuity even when they share a visual grammar.
- **Own raw terminal mode directly.** Effect's scoped terminal input already
  sets and restores raw mode and decodes keys; owning it adds risk without
  capability. Rejected.

## Consequences

Positive:

- every human-facing command reads with the same two edges and one record shape;
- prompts, waits, ASCII mode, and width rules share one painter;
- prompt and scene states are pure functions that gallery fixtures and table
  tests cover without a terminal; and
- the painter remains the single replaceable seam.

Negative:

- the `rows`, `row`, and `collapsed` nodes, the task-tree live view, and the
  prompt module are replaced outright, touching every plan-family view and
  prompt site;
- Windows Terminal key decoding remains a reviewed matrix expectation because
  the pseudo-terminal harness runs only on POSIX; and
- terminal resize requires conservative handling of uncertain cursor geometry,
  with emulator and real PTY evidence beyond still snapshots.

## Amendment: preserve the accumulating transcript

Maintainer acceptance of output continuity replaces the earlier live-ledger
window, including its policy of retaining settled rows only while they fit.
Height limits apply to current activity and controls. They no longer decide
which previously reported outcomes remain visible. Phase milestones and
exceptions are appended as work advances; the final result remains a complete
independent document on stdout.

The implementation removes plan injection into the frame, the live ledger's
window and fold rules, and implicit required-action detection. Screen selects
a scoped owner; Frame serializes the active tail and durable writes. Existing
lifecycle events remain the shared source for human narration, machine output,
and telemetry. No additional mode or event bus is introduced.

The executable specification `cli/output-preserves-committed-history`
supersedes `cli/live-progress-retains-settled-units`. Channel, machine,
credential, review, failure, and recovery obligations retain their own
specification authorities.

## Supersession and reconsideration

Reconsider application-owned prompts if a required interaction cannot be
expressed as a reducer and a `Doc` view, or if key decoding cannot be made
reliable on a supported terminal. Reconsider Ink under the clause of the view
model decision, with this record's evidence as the baseline. Any superseding
decision must keep machine output independent of the human document and must
keep features free of terminal wording.
