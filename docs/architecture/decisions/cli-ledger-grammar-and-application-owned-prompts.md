---
type: Decision
status: stable
description: AXM human output speaks one ledger grammar through a shared gutter and one live scene, prompts and human waits are application-owned documents run by the Screen, and Ink remains deferred.
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

1. **One gutter.** Every node that carries a mark paints it in a five-column
   gutter, and content starts at column six, so titles, callouts, ledger rows,
   answers, and prompts share one left edge.
2. **One ledger.** A plan, its live progress, and its result are the same
   `ledger` node with different final columns and marks. In an animated
   terminal the plan ledger becomes the progress ledger and settles into the
   result ledger, so scrollback holds one ledger per operation.
3. **One scene.** The live region shows one scene: the operation's ledger with
   at most one interaction — a prompt or a wait — beneath it. When a part of
   the scene finishes it leaves the region and appends its settled form to the
   transcript.

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
[Publish](../commands/publish.md) owns resuming a pending authorization.

Accepting authority: maintainer approval of the terminal grammar redesign.
Existing executable specifications continue to own observable obligations;
new obligations land as specifications with the changes that implement them.

## Rationale

The accepted architecture already had the right seams. A grammar expressed as
node vocabulary and painter constants holds everywhere the painter runs,
including ASCII mode and every width, without each view or prompt
re-implementing alignment. Making plan, progress, and result one ledger removes
duplicated scrollback and lets a person read an operation as one record.

A prompt painted through the painter inherits the gutter, key chips, glyph
policy, and resize-safe erase by construction. The existing selection widgets
were already reducers wrapped in string rendering, so the move deletes code
rather than adding a framework. Placing prompts and waits in the same scene as
the ledger is what lets a gate be answered while the plan is visible and a
step-up verification interrupt an upload without hiding its rows.

## Material alternatives

- **Keep Effect prompt widgets and restyle around them.** The widgets cannot
  take the gutter, ASCII policy, or answer-line collapse, and their line-count
  erase breaks on resize. Rejected.
- **Adopt Ink for prompts and the live region.** A component tree would give a
  scene, but would make feature views depend on one framework and duplicate
  the painter's width and glyph rules. Rejected for now.
- **Keep separate plan, progress, and result layouts.** Each is simpler alone,
  but scrollback repeats units and nothing aligns across them. Rejected.
- **Own raw terminal mode directly.** Effect's scoped terminal input already
  sets and restores raw mode and decodes keys; owning it adds risk without
  capability. Rejected.

## Consequences

Positive:

- every human-facing command reads with one left edge and one record shape;
- prompts, waits, ASCII mode, and width rules share one painter;
- prompt and scene states are pure functions that gallery fixtures and table
  tests cover without a terminal; and
- the painter remains the single replaceable seam.

Negative:

- the `rows`, `row`, and `collapsed` nodes, the task-tree live view, and the
  prompt module are replaced outright, touching every plan-family view and
  prompt site;
- key decoding across Windows Terminal and tmux needs pseudo-terminal
  end-to-end evidence before the old widgets are removed; and
- the height budget now splits between a ledger and an interaction, which
  needs fixtures at short terminal heights.

## Supersession and reconsideration

Reconsider application-owned prompts if a required interaction cannot be
expressed as a reducer and a `Doc` view, or if key decoding cannot be made
reliable on a supported terminal. Reconsider Ink under the clause of the view
model decision, with this record's evidence as the baseline. Any superseding
decision must keep machine output independent of the human document and must
keep features free of terminal wording.
