---
type: Architecture
status: stable
description: The terminal design system for AXM human output — the gutter and value column, document vocabulary usage, tone and glyph semantics, per-stream color policy, responsive layout, the live scene, the gallery, pseudo-terminal evidence, the supported terminal matrix, and the time-to-first-output budget.
depends-on:
  - ./output.md
  - ../decisions/cli-output-view-model-and-terminal-ownership.md
  - ../decisions/cli-live-event-contract.md
  - ../decisions/cli-ledger-grammar-and-application-owned-prompts.md
---

# Terminal design

Human output is a typed document painted once for every terminal. The design
system exists so that feature views choose meaning and the painter chooses
form, and so that the same document reads well at forty columns in a CI log
and at two hundred columns in a wide terminal.

## Responsibilities

This document owns how feature views select document vocabulary, the gutter
and value column every node aligns to, what tones and glyphs mean and where a
glyph goes, when color and animation are permitted, how layout responds to
width and height, what the live scene shows, how the design is reviewed, which
terminals are supported, and what latency the first output must meet.

## Non-responsibilities

It does not inventory node fields, painter options, or event fields; the
`Doc` types, the painter, and the lifecycle event schema own those. It does
not own channel boundaries or contract authority, which [CLI output](output.md)
owns, or when a prompt or wait may open, which [Interaction](interaction.md)
owns. It establishes no obligation: executable specifications such as
`cli/non-tty-output-is-plain-and-unpadded` own the enforceable properties
described here. The choice of this grammar is recorded in
[CLI ledger grammar and application-owned prompts](../decisions/cli-ledger-grammar-and-application-owned-prompts.md).

## Margin, gutter, and value column

Human output has two left edges. An unmarked title, verdict, `Next` label,
empty-state sentence, or hint begins at the margin. Every node that carries a
mark paints it in a five-column gutter — a space, the mark, and padding — and
content aligned with that mark begins at column six. Ledger headers and rows,
callout bodies, fields, answers, prompt options, `Next` actions, and a wait's
URL use that content edge. Marks are status glyphs, change operations, the
prompt mark `?`, and the caret ❯.

Fields, answers, waits, and callout asides put their value at the value
column, which is the start of a ledger's second column — column 36 at eighty
columns, moving left as the name column shrinks. A settled setup or publish
therefore reads as one aligned record.

## Vocabulary

A view picks the node whose meaning matches the result, never the node whose
shape happens to fit the terminal.

| Need                                                         | Node                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Show units an operation plans, is running, or has settled    | `ledger`; columns declare a header, a role, and a priority, and each row carries a mark and a unit id |
| Compare many like read-only items across the same attributes | `table`, optionally with a leading mark per row to flag the item that needs attention                 |
| Show containment or hierarchy                                | `tree`                                                                                                |
| Describe one item                                            | `fields`                                                                                              |
| State the outcome of the command                             | `headline` with the outcome tone; one per result                                                      |
| State facts beside an outcome                                | the outcome `headline`'s `aside`; semantic parts are joined by the painter                            |
| Summarize a read-only inventory                              | `summary`; semantic parts joined by the painter as an inventory footer                                |
| Explain a condition that needs attention                     | `callout` with a tone and optional children; never for the outcome itself                             |
| Say something in prose                                       | `paragraph`; a tone only when the prose is itself a warning, error, or aside                          |
| Point to the next command or link                            | `next` with suggested actions; machine mode emits them as suggestion events                           |
| Ask a question                                               | `prompt`, built by the `Screen` from an `Ask` while one is open; views never build it                 |
| Park the terminal while a person acts elsewhere              | `wait`, built by the `Screen` while one is open; views never build it                                 |
| Record an answered prompt                                    | `answer`, appended by the `Screen` when a prompt or a wait settles; views never build it              |
| Group related nodes under a dim title                        | `section`                                                                                             |
| Pass text through untouched                                  | `raw` or `markdown`; the painter never wraps, truncates, or restyles them                             |

Every command whose result carries a ledger opens with the same title line:
what it is doing, where it acts, and which agents it covers, stated once so no
row repeats it. No command prints a logo or a phase strip; setup opens like
every other command.

A ledger's columns carry a role. The `name` column is protected and shortened
last; `fixed` columns keep their width; an `elastic` column takes spare width.
Plan, progress, and result ledgers differ only in their final columns — a plan
and detail against a status — and their marks. A ledger folds rows that repeat
one outcome, such as unchanged units, into one fold line with a mark, a count, a
noun, and the flag that reveals them. Row children carry per-agent outcomes and
details, aligned to the content column and shown at verbose level. A ledger
takes any columns: lint's are finding, location, and fix, with the rule
identifier and help as a dim child line, and a rule that repeats folds into one
row with a location count. The separator between semantic parts of an aside or
summary belongs to the painter. A view supplies parts and never spells that
separator. Prose within a single ledger cell remains prose.

The painter owns vertical spacing. A result with a ledger has one blank line
between its title, ledger, each callout, verdict, and `Next`. Problems and
empty states are compact: no blank separates their headline, reason or fields,
and `Next`. Settled answer lines form one group. Views use `blank` only inside
authored prose, never to arrange result blocks.

When nothing changed there is no ledger and no title line: the verdict stands
alone, and it keeps its own status glyph because no row above it carries one. A
headline states what happened; its aside states how much. A callout is
subordinate to a headline and never replaces it. A table describes an
inventory, so an inventory that changed nothing is a table. A tree shows
structure, so a flat list is never a tree. A detail page is a headline with a
dim aside, a paragraph, fields, and a `next` command, and a single requested
field prints raw.

## Tone and glyphs

Tone is meaning, not decoration. `ok` marks a satisfied outcome, `warn` a
condition that deserves attention but did not stop the command, `error` a
failure, `info` orientation, `dim` an aside, and `neutral` no claim.

Status glyphs are ✔ for `ok`, ▲ for `warn`, ✖ for `error`, ● for `info`, ◒ for
a running unit, and · for a unit not yet started. Change operations are `+`
created, `~` updated, `-` removed, and `=` unchanged; a row that did not change
as planned carries ▲ blocked, ✖ failed, ↶ rolled back, or · not tried. A
grouped selection shows ◉ selected and ◪ partially selected. The same glyph
always carries the same meaning, so ▲ means "attention" whether it marks a
callout or a blocked row.

Where a glyph goes is fixed. A row carries its own mark. A verdict that follows
a ledger has no glyph, because the rows already carry status; it is bold and
toned. A problem with no ledger above it leads with its glyph in the gutter. A
callout always has one. A blocked verdict is the one callout that states an
outcome: the operation is waiting on a person, so it keeps the attention mark
and carries its reason beneath it.

A problem reads the same for every error kind: a title naming the category,
with the stable code and the process exit code as a dim aside at the value
column; the reason beneath it; identifiers as fields, where validation failures
list the inputs they rejected in place of a sentence; and every recovery as a
copyable `next` command. A defect reads as an internal problem whose recovery
is the report link. Blocked, partial, and interrupted outcomes reuse the ledger
rather than a bespoke layout: a unit blocked by its own condition is ▲, a unit
the operation stopped before is · not tried, and a unit in flight when a
restoring operation stopped is ↶ rolled back. Their verdict's aside ends with
the exit code.

Glyph width is measured, not trusted. ✔ ✖ ◒ ◓ ↶ ❯ ◉ ◪ are Neutral in Unicode
East Asian Width. ▲ ● ◯ · … and the tree connectors are Ambiguous: they resolve
to one cell outside East Asian contexts, so they are measured as one. Every
ambiguous mark paints in the gutter, which absorbs it: a terminal that draws ▲
two cells wide shifts only that row's content. The separator, the middle
ellipsis of a shortened name, the tree connectors, and a list's ↑ ↓ arrows are
the ones that paint inline instead, where a two-cell render pushes the rest of
their own line right. The spinner uses only the Neutral frames ◒ and ◓ so its width never
changes between frames. `AXM_ASCII=1` is the escape for a terminal that still
misdraws them.

An ASCII glyph set replaces the symbols when the terminal cannot be trusted to
render them: when `TERM` is `dumb`, when the locale does not declare UTF-8, or
when `AXM_ASCII=1` forces it. ASCII status is two letters — `ok`, `!!`, `xx`,
and `..` — so `+` always means created and never collides with a status. The
caret is `>`, a selection is `[x]` selected, `[ ]` unselected, and `[-]`
partially selected, and a list's arrows are `^` and `v`. A running unit is `..` and does not animate, because a
terminal that cannot be trusted with symbols is not trusted with motion either.
Every ordinary ASCII mark fits the same five-column gutter. Pick options are
the deliberate exception: `[x]`, `[ ]`, and `[-]` are wider than their Unicode
marks, so their titles begin two columns farther right. The ASCII `info` and
running marks both use `..`; context distinguishes the one intentionally shared
mark. The painter and AXM-authored phrases otherwise emit seven-bit text under
the ASCII glyph set; user and Registry content passes through unchanged.

## Color and animation

Color is applied per stream. A stream receives ANSI styling only when it is a
terminal; a piped stdout stays plain while an attached stderr may still be
styled. `NO_COLOR`, `FORCE_COLOR=0`, `CI`, and `TERM=dumb` disable color on
every stream, and `FORCE_COLOR` enables it without a terminal. Animation
requires a stderr terminal and the same environment conditions, and forced
color never implies a live terminal.

Only the eight standard colors and the dim attribute are used, never
hard-coded RGB, so output reads on light and dark themes alike. Extension type
tints map to the nearest standard color, and key chips are inverse cyan for
the default and inverse dim for the others. Links use the terminal hyperlink
sequence only when color is enabled.

## Responsive layout

Every painted line fits the terminal width. The painter measures display
width, so wide characters and combining marks count correctly.

Ledgers and tables share one layout engine. Columns declare a preferred width,
a minimum width, and a priority of `required`, `preferred`, or `optional`. At a
given width the painter first lays the columns out at natural widths; if that
overflows it shrinks the widest shrinkable columns toward their minimums and
wraps their cells onto continuation lines aligned to the column; if that still
overflows it drops `optional` columns and then `preferred` columns from the
right, never a `required` column. Headers use the computed widths and
alignment, so a header never drifts from its cells. Breakpoints are emergent,
not configured: with a required name, a preferred version, and an optional
elastic detail, spare width flows to detail and detail drops first.

A ledger drops only its `optional` columns, whose values a flag or `--verbose`
still reveals. When the columns it keeps — the gutter, the name, and every
column that is not optional — overflow, it stacks each row into its mark and
name on one line and its remaining values beneath, rather than drop a value
that has nowhere else to appear. It stacks on that overflow, not at a fixed
width, and its name column holds the key lane, so a ledger's second column,
its fields, and its answers share the value column. A read-only table instead
drops `preferred` columns and stacks below forty columns, which suits wide
inventories.

A question yields in three steps. Its key chips follow it on one line while
both fit; then they take the line beneath it, aligned to the content column;
then they lose their words and the question wraps with a hanging indent. The
chip of the choice `enter` takes is filled and its key capitalised, so the
default reads the same on a terminal without color.

A list opens under its question with one line per option, so it is exactly
as tall as it looks. The caret marks the option `enter` takes, titles sit at
the content column, and details sit at the value column. Details show for
every option or for none: a narrow list drops them all before it shortens a
title in the middle, rather than leaving some options looking bare. A list
shows as many options as the height it is given and names the rest on a dim
line at the content column, `↑ 3 more` above the window and `↓ 3 more` below
it, and its window follows the caret instead of scrolling the terminal. A
typed line follows its question behind the caret, or takes the line beneath it
when both do not fit; a line the question refuses stays open with the reason
beneath it in the attention mark.

A list that takes several puts each option's selection mark between the caret
and the title. Options that share a group sit one step in under the group's
header, whose mark is partial while only some of them are picked and whose
count sits at the value column; a group whose header scrolls away stays
pinned above the window while the caret is in it. Typing after the question
narrows the list to the titles that contain it and drops groups with no
match. One dim line beneath the list says how many are picked and names its
keys; a narrow line drops the arrows and the words of named keys first, then
every key.

A long name shortens in the middle, keeping its scope and last path segment:
`@acme-enterprise/…/soc2-review`. A copyable value — a URL, a `next` command, a
one-time code, a request identifier — is never cut, truncated, or hyphenated;
when it does not fit it moves to its own line.

A stream that is not a terminal is unbounded. Nothing written to it is
wrapped, truncated, or padded to a terminal width, so an agent or a pager
receives the whole value on one line.

## Live scene

The live region shows one scene: the operation's ledger with at most one
interaction — a prompt or a wait — beneath it. Every part of the scene is a
pure function of its state and the terminal facts to a document painted by the
one painter, and wording comes from the phrase layer beside the painter, never
from the events.

The live ledger is the plan's rows joined to live progress by unit id. Plan
rows, lifecycle events, and resolved units share one identifier, and views
obtain it from the plan layer rather than rebuilding it. A running row shows ◒,
its state word and its measure; a row not yet started shows `· waiting`; and a
row is paused while a wait whose subject
is that unit is open. An operation with no plan, such as sign-in or upgrade,
synthesizes rows from its units. A wait that names no unit, such as another
operation holding the workspace, is the system's rather than a row's: it
stands beneath the ledger in place of the status line, with how long it has
lasted, who holds it, and what stopping costs. Nested units roll up into their parent row's
state word and measure.

The scene never exceeds the terminal height less two rows. The ledger window
shows running rows first, then the next few waiting, then the ledger's own fold
line, which carries the waiting mark, how many rows it stands for, and how many
have finished; settled rows leave the window and return in the result. Beneath
the ledger one dim line says what the operation is doing, how far it has come,
and how long it has taken. When a ledger and an interaction compete for height, the interaction
keeps its minimum — its question, three rows, and a hint — and the ledger window
shrinks to its header and fold line.

Live lines never wrap. Every repainting line is truncated to one column less
than the terminal width with the active glyph set's ellipsis. Copyable values are kept out of repainting lines: a
wait prints its URL to the transcript once and keeps only its countdown live.
After a narrowing resize the frame erases the rows the terminal rewrapped, not
the lines it painted, so no ghost lines remain.

When a part of the scene finishes it leaves the region and appends its settled
form to the transcript: a prompt becomes an `answer` line, a wait becomes a ✔
line, and at settlement the region clears and the full
result ledger prints once, on stdout, complete for pipes. Rows that did not fit
leave the window, never the result. The settled document prints after every
lossless subscriber has drained, so live output never overtakes settled
output.

When animation is unavailable — CI, pipes, `TERM=dumb` — the same transitions
become transcript lines: one when the operation starts, one per wait, and one
when it settles, followed by the result ledger. Without a terminal,
`--verbose` adds per-row timings to the result ledger; it does not stream one
line per unit. An open prompt is the exception: it is not progress but the
thing the person has to answer, so it paints and repaints wherever the region
can be erased at all. A quiet wait is instead a static required-action block.
The region hands the cursor back
the moment it empties. How quiet mode treats the transition lines belongs to
[CLI output](output.md).

## Gallery

The gallery under `apps/cli/src/test-support/gallery/` is the acceptance
surface for design. Each fixture is one document or scene for one scenario —
an inventory list, an inspection, a plan, progress, and result ledger, a
failure with recovery, a waiting operation, a wait in its open, static, and
settled forms, each prompt kind in its initial, filtered, error, narrow, and
answered states, and every node kind — and its
file snapshots record the painted output at 40, 80, 120, and 200 columns, and
at 16 and 24 rows where a scene must fit. A scene fixture is a pure function
of the terminal size, painted one column short of the width and held within the
height less two rows. A fixture drawn from the design canvas is named
`<board>--<frame>`, so its snapshots can be held against the mock they
implement. Retained alternatives are separate fixtures only while they remain
useful review scenarios; superseded or semantically duplicate variants are
removed. A design change is reviewed by its snapshot diff.

```bash
pnpm exec nx run cli:gallery -- --name <fixture> --width <columns> --rows <rows>
```

## Terminal evidence

The gallery paints pure functions, so it reaches every state a scene or prompt
can hold but none of the terminal itself. Raw mode, key decoding, and the
cleanup that follows an interrupt exist only when stdin is a terminal, and a
prompt that leaves raw mode on or the cursor hidden breaks the shell it
returns to. The pseudo-terminal harness in `apps/cli-e2e/src/pty.ts` is where
that evidence comes from: it runs the built artifact under a real terminal of
a declared size, replays a script of waits and key writes against it, and
reports the transcript together with whether raw mode was handed back and the
cursor left visible. Each interaction kind proves its keys there; the states
it can be in are proved in the gallery.

The harness needs a pseudo-terminal, which the toolchain supplies on POSIX
only, so it runs on macOS and Linux and skips on Windows. Windows key decoding
stays a reviewed expectation of the matrix below rather than an automated one.

```bash
pnpm exec nx run cli-e2e:e2e-main
```

## Supported terminals

| Environment                 | Expectation                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Light and dark themes       | Standard colors and dim only; every tone legible on both                                                               |
| tmux                        | Animation, resize, key input, and hyperlinks behave as in the host terminal                                            |
| VS Code integrated terminal | Full support; narrow panes trigger the responsive layout                                                               |
| Warp                        | Full support; the live scene does not fight the block model                                                            |
| Windows Terminal            | Full support with the Unicode glyph set and key input                                                                  |
| CI logs                     | Plain mode; transcript lines, no cursor movement, no color unless forced                                               |
| Narrow panes                | Ledgers stack when the columns they keep overflow; tables stack below forty; below twenty the painter paints at twenty |
| Short panes                 | The scene fits the height; the ledger window shrinks before an interaction does                                        |
| Piped or redirected streams | Unbounded plain text                                                                                                   |

## Time to first output

The first byte on stdout or stderr arrives within 300 ms at the median and
400 ms at p95 for `axm --version`, and a workspace listing's first byte meets
the same budget while its settled document arrives within 700 ms at p95 on a
warm cache. Startup dominates: the runtime and module loading cost roughly
250 ms before any command work, so the live frame must appear inside that
budget and a budget below it requires a startup change, not a presentation
change. These numbers are a maintained target, not a requirement: the
diagnostic benchmark under `benchmarks/` measures them, `pnpm bench` runs it
against the built CLI, and a change that moves the trend is reviewed against
the target. A required bound would become a performance specification.
