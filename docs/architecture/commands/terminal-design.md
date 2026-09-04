---
type: Architecture
status: stable
description: The terminal design system for AXM human output — document vocabulary usage, tone and glyph semantics, per-stream color policy, responsive layout, the live region, the gallery, the supported terminal matrix, and the time-to-first-output budget.
depends-on:
  - ./output.md
  - ../decisions/cli-output-view-model-and-terminal-ownership.md
  - ../decisions/cli-live-event-contract.md
---

# Terminal design

Human output is a typed document painted once for every terminal. The design
system exists so that feature views choose meaning and the painter chooses
form, and so that the same document reads well at forty columns in a CI log
and at two hundred columns in a wide terminal.

## Responsibilities

This document owns how feature views select document vocabulary, what tones
and glyphs mean, when color and animation are permitted, how layout responds
to width, what the live region shows, how the design is reviewed, which
terminals are supported, and what latency the first output must meet.

## Non-responsibilities

It does not inventory node fields, painter options, or event fields; the
`Doc` types, the painter, and the lifecycle event schema own those. It does
not own channel boundaries or contract authority, which [CLI output](output.md)
owns, and it establishes no obligation: the executable specification
`cli/non-tty-output-is-plain-and-unpadded` owns the one enforceable property
described here.

## Vocabulary

A view picks the node whose meaning matches the result, never the node whose
shape happens to fit the terminal.

| Need                                                | Node                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Compare many like items across the same attributes  | `table`; columns carry width hints and priority so the painter can respond to width |
| Report what changed, unit by unit                   | `rows` of `row`, each with a change glyph; nested children carry per-agent outcomes |
| Show containment or hierarchy                       | `tree`                                                                              |
| Describe one item                                   | `fields`                                                                            |
| State the outcome of the command                    | `headline` with the outcome tone; one per result                                    |
| Summarize counts and elapsed time after the outcome | `summary`                                                                           |
| Explain a condition that needs attention            | `callout` with a tone and optional children; never for the outcome itself           |
| Say something in prose                              | `paragraph`; a tone only when the prose is itself a warning, error, or aside        |
| Point to the next command or link                   | `next` with suggested actions; machine mode emits them as suggestion events         |
| Fold repeated unchanged items                       | `collapsed` with a count, a noun, and the flag that reveals them                    |
| Group related nodes under a dim title               | `section`                                                                           |
| Pass text through untouched                         | `raw` or `markdown`; the painter never wraps, truncates, or restyles them           |

A headline states what happened; a summary states how much. A callout is
subordinate to a headline and never replaces it. Rows describe change, so an
inventory that changed nothing is a table. A tree shows structure, so a flat
list is never a tree.

## Tone and glyphs

Tone is meaning, not decoration. `ok` marks a satisfied outcome, `warn` a
condition that deserves attention but did not stop the command, `error` a
failure, `info` orientation, `dim` an aside, and `neutral` no claim.

Status glyphs accompany a headline or callout: ✔ for `ok`, ▲ for `warn`, ✖
for `error`, and ● for `info`. Change glyphs prefix a row: `+` created, `~`
updated, `–` removed, `=` unchanged, ▲ blocked, × failed, and ↶ rolled back.
The same glyph always carries the same meaning, so ▲ means "attention" whether
it opens a callout or a blocked row.

An ASCII glyph set replaces both families when the terminal cannot be trusted
to render the symbols: when `TERM` is `dumb`, when the locale does not declare
UTF-8, or when `AXM_ASCII=1` forces it. The ASCII set keeps the meanings and
the widths, so layout is identical under both.

## Color and animation

Color is applied per stream. A stream receives ANSI styling only when it is a
terminal; a piped stdout stays plain while an attached stderr may still be
styled. `NO_COLOR`, `FORCE_COLOR=0`, `CI`, and `TERM=dumb` disable color on
every stream, and `FORCE_COLOR` enables it without a terminal. Animation
requires a stderr terminal and the same environment conditions, and forced
color never implies a live terminal.

Only the eight standard colors and the dim attribute are used, never
hard-coded RGB, so output reads on light and dark themes alike. Links use the
terminal hyperlink sequence only when color is enabled.

## Responsive layout

Every painted line fits the terminal width. The painter measures display
width, so wide characters and combining marks count correctly.

Tables and change rows share one layout engine. Columns declare a preferred
width, a minimum width, and a priority of `required`, `preferred`, or
`optional`. At a given width the painter first lays the table out at natural
widths; if that overflows it shrinks the widest shrinkable columns toward their
minimums and wraps their cells onto continuation lines aligned to the column;
if that still overflows it drops `optional` columns and then `preferred`
columns from the right, never a `required` column; and if the required set
still overflows, or the width is below forty columns, it paints each row as a
stacked block of label and value pairs. Headers use the computed widths and
alignment, so a header never drifts from its cells.

A stream that is not a terminal is unbounded. Nothing written to it is
wrapped, truncated, or padded to a terminal width, so an agent or a pager
receives the whole value on one line.

## Live region

While an operation runs, the frame paints a task tree from the lifecycle
event stream: one root line for the operation with its phase and counts, one
line per active unit with a glyph for its state, numeric progress for units
that report bytes, files, or items, and a waiting line when the operation is
blocked on another process. Resolved units leave the tree as they settle, so
the region stays bounded. Wording comes from the phrase layer beside the
painter, never from the events.

When animation is unavailable the same transitions become transcript lines:
one when the operation starts, one when it waits, and one when it settles.
Quiet mode suppresses all of them.

At settlement the frame collapses the tree into one transcript line and clears
the region; the settled document prints after every lossless subscriber has
drained, so live output never overtakes settled output.

## Gallery

The gallery under `packages/cli/src/screen/gallery/` is the review route for
design. Each fixture is one document for one scenario — an inventory list, an
inspection, a mutating result with agent outcomes, a failure with recovery, a
plan preview with risks, a waiting operation, and every node kind — and its
file snapshots record the painted output at 40, 80, 120, and 200 columns.
Alternatives for a key use case are separate fixtures, so the chosen
alternative is visible beside the ones it beat. A design change is reviewed by
its snapshot diff.

```bash
pnpm exec nx run cli:gallery -- --name <fixture> --width <n>
```

## Supported terminals

| Environment                 | Expectation                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Light and dark themes       | Standard colors and dim only; every tone legible on both                                                  |
| tmux                        | Animation, resize, and hyperlinks behave as in the host terminal                                          |
| VS Code integrated terminal | Full support; narrow panes trigger the responsive layout                                                  |
| Warp                        | Full support; the live region does not fight the block model                                              |
| Windows Terminal            | Full support with the Unicode glyph set                                                                   |
| CI logs                     | Plain mode; transcript lines, no cursor movement, no color unless forced                                  |
| Narrow panes                | Forty columns and above paint a grid; below forty tables stack; below twenty the painter paints at twenty |
| Piped or redirected streams | Unbounded plain text                                                                                      |

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
