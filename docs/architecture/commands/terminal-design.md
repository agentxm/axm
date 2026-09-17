---
type: Architecture
status: stable
description: The terminal design system for AXM human output — the gutter and value column, document vocabulary usage, tone and glyph semantics, per-stream color policy, responsive layout, the live scene, the gallery, the supported terminal matrix, and the time-to-first-output budget.
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

## Gutter and value column

Every node that carries a mark paints it in a five-column gutter: a space, the
mark, and three spaces. Content always starts at column six, so a title, a
callout, a ledger row, an answer, and a prompt share one left edge. Marks are
status glyphs, change operations, the prompt mark `?`, and the caret ❯.

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
| Summarize counts and elapsed time after the outcome          | the outcome `headline`'s own `aside`, so the claim and its counts are one line                        |
| Explain a condition that needs attention                     | `callout` with a tone and optional children; never for the outcome itself                             |
| Say something in prose                                       | `paragraph`; a tone only when the prose is itself a warning, error, or aside                          |
| Point to the next command or link                            | `next` with suggested actions; machine mode emits them as suggestion events                           |
| Record an answered prompt                                    | `answer`, appended by the `Screen` when a prompt settles; views never build it                        |
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
row with a location count. The separator between parts of a line belongs to the
painter, so a cell or aside that carries several facts joins them as prose
rather than spelling a glyph a view cannot see.

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
callout always has one.

A problem reads the same for every error kind: a title naming the category,
with the stable code and the process exit code as a dim aside at the value
column; validation failures list their inputs as fields; and every recovery is
a copyable `next` command. Blocked, partial, and interrupted outcomes reuse the
ledger rather than a bespoke layout.

Glyph width is measured, not trusted. ✔ ✖ ◒ ◓ ↶ ❯ ◉ ◪ are Neutral in Unicode
East Asian Width. ▲ ● ◯ · … and the tree connectors are Ambiguous: they resolve
to one cell outside East Asian contexts, so they are measured as one. Every
ambiguous mark paints in the gutter, which absorbs it: a terminal that draws ▲
two cells wide shifts only that row's content. The separator, the middle
ellipsis of a shortened name, and the tree connectors are the ones that paint
inline instead, where a two-cell render pushes the rest of their own line
right. The spinner uses only the Neutral frames ◒ and ◓ so its width never
changes between frames. `AXM_ASCII=1` is the escape for a terminal that still
misdraws them.

An ASCII glyph set replaces the symbols when the terminal cannot be trusted to
render them: when `TERM` is `dumb`, when the locale does not declare UTF-8, or
when `AXM_ASCII=1` forces it. ASCII status is two letters — `ok`, `!!`, `xx`,
and `..` — so `+` always means created and never collides with a status. The
caret is `>`, and a selection is `[x]` selected, `[ ]` unselected, and `[-]`
partially selected. Every ASCII mark fits the same five-column gutter, so
layout is identical under both sets.

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
its state word, and its measure; a settled row shows its final mark; a row not
yet started shows `· waiting`; and a row is paused while a wait whose subject
is that unit is open. An operation with no plan, such as sign-in or upgrade,
synthesizes rows from its units. Nested units roll up into their parent row's
state word and measure.

The scene never exceeds the terminal height less two rows. The ledger window
shows running rows first, then the next few waiting, then a fold line such as
`… 33 more waiting · 12 done`; settled rows leave the window and return in the
result. When a ledger and an interaction compete for height, the interaction
keeps its minimum — its question, three rows, and a hint — and the ledger window
shrinks to its header and fold line.

Live lines never wrap. Every repainting line is truncated to one column less
than the terminal width. Copyable values are kept out of repainting lines: a
wait prints its URL to the transcript once and keeps only its countdown live.
After a narrowing resize the frame erases the rows the terminal rewrapped, not
the lines it painted, so no ghost lines remain.

When a part of the scene finishes it leaves the region and appends its settled
form to the transcript: a prompt becomes an `answer` line, a wait becomes a ✔
line with its elapsed time, and at settlement the region clears and the full
result ledger prints once, on stdout, complete for pipes. Rows that did not fit
leave the window, never the result. The settled document prints after every
lossless subscriber has drained, so live output never overtakes settled
output.

When animation is unavailable — CI, pipes, `TERM=dumb` — the same transitions
become transcript lines: one when the operation starts, one per wait, and one
when it settles, followed by the result ledger. Per-unit lines appear only with
`--verbose`. How quiet mode treats these lines belongs to
[CLI output](output.md).

## Gallery

The gallery under `apps/cli/src/test-support/gallery/` is the acceptance
surface for design. Each fixture is one document or scene for one scenario —
an inventory list, an inspection, a plan, progress, and result ledger, a
failure with recovery, a waiting operation, each prompt kind in its initial,
filtered, error, narrow, and answered states, and every node kind — and its
file snapshots record the painted output at 40, 80, 120, and 200 columns, and
at 16 and 24 rows where a scene must fit. A scene fixture is a pure function
of the terminal size, painted one column short of the width and held within the
height less two rows. A fixture drawn from the design canvas is named
`<board>--<frame>`, so its snapshots can be held against the mock they
implement. Alternatives for a key use case are separate fixtures, so the chosen
alternative is visible beside the ones it beat. A design change is reviewed by
its snapshot diff.

```bash
pnpm exec nx run cli:gallery -- --name <fixture> --width <columns> --rows <rows>
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
