---
type: Architecture
status: stable
description: The terminal design system for AXM human output — the gutter and value column, document vocabulary usage, tone and glyph semantics, per-stream color policy, responsive layout, the active region, design review through the gallery, renderer conformance, and the lab, pseudo-terminal evidence, the supported terminal matrix, and the time-to-first-output budget.
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

This document owns the design rules for human output: vocabulary selection,
the gutter and value column, tone and glyph meaning and placement, color,
responsive layout, the active region's layout, design review, supported
terminals, and the first-output budget. It holds their rationale and every
rule no check enforces; where a check does enforce one, it states the
principle and names the check.

## Non-responsibilities

It does not inventory node fields, painter options, or event fields; the `Doc`
types in `apps/cli/src/screen/doc.ts`, the painter, and the lifecycle event
schema own those. [CLI output](output.md) owns channel boundaries, the
transcript and active-region model, and contract authority.
[Interaction](interaction.md) owns when a prompt or wait may open and how each
one ends. This document establishes no obligation: the executable
specifications it names, indexed by the
[specification catalog](../../../specifications/catalog.md), own the
enforceable properties. The choice of this grammar is recorded in
[CLI ledger grammar and application-owned prompts](../decisions/cli-ledger-grammar-and-application-owned-prompts.md).

## Margin, gutter, and value column

Human output has two left edges. An unmarked title, verdict, `Next` label,
empty-state sentence, or hint begins at the margin. Every node that carries a
mark paints it in a five-column gutter — a space, the mark, and padding — and
content aligned with that mark begins at column six. Ledger headers and rows,
callout bodies, fields, answers, prompt options, `Next` actions, a wait's URL,
and prose that continues a marked headline use that content edge. Marks are status glyphs, change operations, the
prompt mark `?`, and the caret ❯.

Fields, answers, waits, and callout asides put their value at the value
column, which is also where a ledger's second column begins: column 36 at
eighty columns, moving left on a terminal narrower than seventy columns so
values keep half the line. A settled setup or publish therefore reads as one
aligned record. The one exception is a wait that expires: how long is left is
part of its sentence, so the painter joins it to the status with its
separator rather than setting it at the value column.

## Vocabulary

A view picks the node whose meaning matches the result, never the node whose
shape happens to fit the terminal.

| Need                                                         | Node                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Compare units an operation plans or has settled              | `ledger`; columns declare a header, a role, and a priority, and each row carries a mark and a unit id |
| Compare many like read-only items across the same attributes | `table`, optionally with a leading mark per row to flag the item that needs attention                 |
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
| Group related nodes, optionally under a dim title            | `section`; the painter sets sibling sections apart                                                    |
| Pass text through untouched                                  | `raw` or `markdown`; the painter never wraps, truncates, or restyles them                             |

Every command whose result carries a ledger opens with the same title line:
what it is doing, where it acts, and which agents it covers, stated once so no
row repeats it. A condition the operation reports about its units — a
release-age decision, a warning several units share — stands between the rows
and the verdict, and states nothing a row contradicts: an annotation naming a
unit that did not settle as planned yields to that unit's own reason. `Next` is
the last thing a reader sees, and on a result that did not succeed it names a
recovery that fits: the emitting command again, narrowed to the units still
waiting where an unchanged retry can change their outcome, or what the
producers of those failures themselves suggested. Where no command would
change the outcome, it offers no retry. No command prints a logo or a phase
strip; setup opens like every other command.

A ledger's columns carry a role. The `name` column is protected and shortened
last; `fixed` columns keep their width; an `elastic` column takes spare width.
Plan and result ledgers share one grammar — the unit, its version, its
outcome, and a detail — and differ in their marks and in the outcome column, a
plan's `Plan` against a result's `Status`. A version column states the move a
unit made where both ends are known, the version still installed
for a unit that did not settle, and that its target is not resolved yet where
a plan has not resolved one. A ledger folds rows that repeat one outcome, such
as unchanged units, into one fold line with a mark, a count, a noun, and the
flag that reveals them. A row that did not settle as planned carries its
reason: one line beneath the row, at the content column, toned as the row's
own mark, painted at every width and every level of detail because a reason
has nowhere else to appear. Row children carry per-agent outcomes and details,
aligned to the same column and shown at verbose level. A ledger takes any
columns: lint's are finding, location, and fix, with the rule identifier and
help as a dim child line, and a rule that repeats folds into one row with a
location count. The separator between semantic parts of an aside or summary
belongs to the painter; a view supplies parts and never spells it. Prose
within a single ledger cell remains prose.

The painter owns vertical spacing, so a view never spaces result blocks
itself: `blank` separates only two paragraphs of authored prose, and the
`axm-policy/no-layout-blank` lint rule holds CLI sources to that. A result
with a ledger has one blank line between its title, ledger, each callout,
verdict, and `Next`. Problems and empty states are compact: no blank separates
their headline, reason or fields, and `Next`. Settled answer lines form one
group. Sibling sections, such as the groups of help and each of its examples,
stand one blank line apart, and in a result a titled section stands apart
from what precedes it. Anything a view places after `Next` stands one blank
line apart from it, because `Next` closes a result. An inset paragraph — the
one value a sentence asks a person to act on — stands one blank line apart
from the prose around it, and guidance that sets a value apart spaces its
`Next` like a result. The
painter's vertical-spacing tests in `apps/cli/src/screen/paint-text.test.ts`
hold these rules.

When nothing changed there is no ledger and no title line: the verdict stands
alone, and it keeps its own status glyph because no row above it carries one. A
headline states what happened; its aside states how much. A callout is
subordinate to a headline and never replaces it. A table describes an
inventory, so an inventory that changed nothing is a table. A detail page is a
headline with a dim aside, a paragraph, fields, and a `next` command, and a
single requested field prints raw.

## Tone and glyphs

Tone is meaning, not decoration. `ok` marks a satisfied outcome, `warn` a
condition that deserves attention but did not stop the command, `error` a
failure, `info` orientation, `dim` an aside, and `neutral` no claim.

Status glyphs are ✔ for `ok`, ▲ for `warn`, ✖ for `error`, ● for `info`, ◒ for
a running unit, and · for a unit not yet started. Change operations are `+`
created, `~` updated, `-` removed, and `=` unchanged; a row that did not change
as planned carries ▲ blocked, ✖ failed, ↶ rolled back, or · not tried. A
grouped selection shows ◉ selected and ◪ partially selected: a group only some
of whose options are picked, or an option that comes along with a picked one
without being picked itself. The same glyph always carries the same meaning,
so ▲ means "attention" whether it marks a callout or a blocked row. Glyphs
come only from the painter's glyph sets in `apps/cli/src/screen/glyphs.ts`;
authored text never supplies one.

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

Glyph width is measured, not trusted. Every glyph counts as one cell, as
terminals draw East Asian Ambiguous characters outside East Asian contexts.
An Ambiguous mark such as ▲ paints only in the gutter, which absorbs a
terminal that draws it two cells wide; the separator, the middle ellipsis, and
the arrows of lists and hints are the accepted inline exceptions, where a
two-cell render shifts only the rest of their own line. The spinner's frames ◒
and ◓ are Neutral, so its width never changes. The width table in
`apps/cli/src/screen/glyph-width.test.ts` records each glyph's class and fails
on an unrecorded glyph or an unaccepted inline one. `AXM_ASCII=1` is the
escape for a terminal that still misdraws them.

The ASCII glyph set replaces the symbols when the terminal cannot be trusted
to render them; `cli/ascii-human-output-preserves-content` owns when it
applies. Under it the painter and AXM-authored phrases emit seven-bit text,
while user and Registry content passes through unchanged. Status is two characters —
`ok`, `!!`, `xx`, and `..` — so `+` always means created and never collides
with a status; a rolled-back row is `<` and an untried or waiting one `.`. The
caret is `>`, selections are `[x]`, `[ ]`, and `[-]`, and a list's arrows are
`^` and `v`. A running unit is `..` and does not animate, because a terminal
that cannot be trusted with symbols is not trusted with motion either; `info`
shares that one mark deliberately, and context tells them apart. Every ASCII
mark fits the five-column gutter except the wider pick options, whose titles
begin two columns farther right.

## Color and animation

Color is decided per stream by `apps/cli/src/screen/output-policy.ts`. A
stream is styled only when it is a terminal, so a piped stdout stays plain
while an attached stderr may still be styled, and `FORCE_COLOR` never styles a
pipe (`cli/non-tty-output-is-plain-and-unpadded`). `NO_COLOR`, `FORCE_COLOR=0`,
`TERM=dumb`, and `CI` turn color off on every stream, though `FORCE_COLOR`
restores it under `CI` on a terminal — a precedence that specification leaves
open. Animation also needs a stderr terminal, and forced color never implies
one. Color only styles: stripped of its styling, colored output is the plain
output.

Only the eight standard colors and the dim attribute are used, never
hard-coded RGB, so output reads on light and dark themes alike. Extension type
tints map to the nearest standard color, and key chips are inverse cyan for
the default and inverse dim for the others. Reverse video belongs to key chips
alone: the painter fills a chip's cell itself, and a view's text cannot ask
for it, so no prose reads as a key to press. Links use the terminal hyperlink
sequence only when color is enabled.

## Responsive layout

Every painted line fits the terminal width and ends without trailing
whitespace. The painter measures display width, so wide characters and
combining marks count correctly. Below twenty columns it paints at twenty.

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

A long word gives way at a path separator or a comma before it is split
between characters, so a path list wraps at its segments and a column's floor
is its widest segment rather than the whole list.

A ledger would rather wrap than drop: it shrinks every column to its word
floors before it gives one up, because wrapping keeps a value in the column
whose header names it. Width then moves what a ledger carries and never
removes it (`cli/ledger-width-relocates-values`). A dropped `optional` column
is repainted beneath each row that has a value for it, dim, at the content
column: the bare value when one column was dropped, and `Header  value` pairs
when more than one was. When the columns it keeps still overflow, it stacks
each row into its mark and name on one line and every remaining value
beneath. Because width never hides a value, the `--verbose` hint appears only
where verbose genuinely shows more: folded already-current and not-selected
rows, and every agent's outcome. A ledger's name column holds the key lane, so
its second column, its fields, and its answers share the value column.

A read-only table would rather drop than wrap, because a reader scans its
rows: it shows an `optional` column whole or not at all, giving up optional
columns from the right before any cell wraps
(`cli/tables-keep-rows-scannable`). Its `name` column never wraps; it keeps
its natural width while any other column can give way and then shortens each
name in the middle, like a ledger's. Once any row spans more than one line, a
blank line sets every row apart so a continuation line never reads as a row.
It drops `preferred` columns too, names what it dropped on a line set apart
from its rows that says a wider terminal shows them, and stacks below forty
columns, which suits wide inventories. An inventory states a value every row
shares once: a column whose view gives that value a summary form leaves the
table and the form joins the summary, after the inventory's own facts and
before what needs attention (`cli/inventories-state-uniform-columns-once`). A
command a summary names is a copyable, tinted invocation, as help shows one.

A protected column is laid out at its natural width even where a width hint
would keep the columns after it on a shared lane: alignment is worth having
while the values fit beside it, and yields to information when they do not. A
name therefore shortens only once every shrinkable column has given up what it
can (`cli/names-yield-width-last`). When it must shorten, it gives up scope
characters and keeps every later segment, because the type segment is what
tells `@acme/skills/docs` from `@acme/knowledge/docs`:
`@acme-enterpr…/skills/audits/soc2-review`. Where no scope worth keeping fits,
whole middle segments go instead, and finally the last segment takes what is
left. Every row of one ledger identifies its unit in the same form, and that
form states the unit's type.

A copyable value — a URL, a `next` command, a one-time code, a request
identifier — is never cut, truncated, or hyphenated; when it does not fit it
moves to its own line, in a ledger cell as anywhere else. Apart from `raw` and
`markdown` content passed through verbatim, it is the only content allowed to
overflow the width. A `Next` action, whether a command or a link, carries its
description beside the target where both fit and beneath it where they do not.

A question yields in three steps. Its key chips follow it on one line while
both fit; then they take the line beneath it, aligned to the content column;
then they lose their words and the question wraps with a hanging indent. The
chip of the choice `enter` takes is filled and its key capitalised, so the
default reads the same on a terminal without color.

A list opens under its question with one line per option, so it is exactly as
tall as it looks. The caret marks the option `enter` takes, titles sit at the
content column, and details sit at the value column, or at one column past it
for the whole list where a title needs the room and details keep half the
line. Details show for every option or for none: a narrow list drops them all
before it shortens a title in the middle, rather than leaving some options
looking bare. A list whose details do not all fit beside their titles keeps
lines beneath itself for the caret's own, wrapped and named, and keeps them
empty where the caret's details already show whole, so its height never
follows the caret. A list shows as many options as the height it is given and
names the rest on a dim line at the content column, `↑ 3 more` above the
window and `↓ 3 more` below it, and its window follows the caret instead of
scrolling the terminal. A typed line follows its question behind the caret, or
takes the line beneath it when both do not fit; a line the question refuses
stays open with the reason beneath it in the attention mark.

A list that takes several puts each option's selection mark between the caret
and the title. An option may bring others with it; while it is picked, each
option it brings carries the partial mark unless it is picked in its own
right, and the line beneath the list counts those apart as included. Taking
everything takes only what no other option showing brings. Options that share
a group sit one step in under the group's header, whose mark is partial while
only some of them are picked and whose count sits at the value column; a group
whose header scrolls away stays pinned above the window while the caret is in
it. The left arrow folds the caret's group to its header, which then names the
first options behind it, and the right arrow opens it; the line that counts
what the window leaves out below also names the groups it has not reached,
`↓ 16 more · productivity (7)`. Typing after the question narrows the list to
the options whose title, details, or group contain it and drops groups with no
match; what was typed is bold where it shows, and details too long for their
line open at the match rather than hide it. One dim line beneath the list says
how many are picked and names its keys; a narrow line drops the arrows and the
words of named keys first, then every key.

A stream that is not a terminal is unbounded: nothing written to it is
wrapped, truncated, or padded to a terminal width, so an agent or a pager
receives the whole value on one line
(`cli/non-tty-output-is-plain-and-unpadded`).

## Transcript and active region

[CLI output](output.md) owns the model — a growing transcript and one active
region that alone repaints — and [Interaction](interaction.md) owns how a
question or wait commits its context and settles. What the transcript must
keep belongs to `cli/output-preserves-committed-history`,
`cli/activity-reports-observed-work`, and
`cli/interactions-retain-context-and-disposition`. This section owns the
region's layout.

The active region holds one activity or one foreground interaction, and an
open interaction takes precedence over progress. Its title identifies the
operation and phase; details may show a current unit, a retry, a measurement,
elapsed time, or the known condition delaying work, and a count never invents
a denominator it did not observe.

Active lines do not wrap. They stop one column short of the terminal width and
fit within its height less two rows, which the gallery checks for every scene,
so copyable values and full failure reasons belong in durable documents. A
resize changes future layout; AXM never recomputes committed content. When old
cursor geometry becomes uncertain, the `Frame` abandons that tail with a
newline instead of moving upward into history; a terminal may still reflow its
own scrollback. CI, pipes, and terminals without animation receive the same
eligible milestones as static text.

## Gallery

The gallery under `apps/cli/src/test-support/gallery/` is the acceptance
surface for design. Each fixture is one document or scene for one scenario:
command results, plans, failures with recovery, waits in their open, static,
and settled forms, each prompt kind in its initial, filtered, error, narrow,
and answered states, transcript checkpoints, and the painter's vocabulary. A
fixture that shows a command's output is that command's own view applied to
sample data, so the gallery reviews what the command paints; only fixtures that
exercise the painter itself, such as the vocabulary and the width and prompt
primitives, build a document by hand. The `vocabulary--` fixtures split the
node kinds across screens a person could meet — a settled result, a read,
pass-through content, and each kind of open question — rather than one
inventory of every node, so each reads as a design and none shows states that
cannot coexist, such as two open questions.

A fixture module is any `*.gallery.ts` file under `apps/cli/src/`, in the
gallery directory or beside the view it exercises. It default-exports
`galleryModule(...)` with its fixtures; nothing registers it. A fixture is a
settled document, a live scene painted as a pure function of the terminal
size, one composed active region, or a transcript checkpoint: its entire
committed history, with no viewport height limit, followed by a bounded scene.
The gallery test and the lab discover the same modules, order fixtures by
name, and fail when two fixtures share a name, because a name is the identity
of its snapshots.

`fixture.ts` owns the widths. Every fixture is checked at 40, 80, 120, and 200
columns and at each width it snapshots. A settled document is snapshot at 40,
80, and 120 unless it declares its own widths — those its mock draws, or 200
where its painting there differs — and a live fixture at all four widths by 16
and 24 rows. At every checked size, `gallery.test.ts` holds each fixture to
the width, whitespace, copyable-value, color, ASCII, unbounded, and height
invariants this document states, and fails on a snapshot file with no fixture
size behind it.

Scenarios that go wrong are drawn from one shared stress data set — qualified
names across every extension type, a scope too long for its lane, absolute
paths, reasons that run to several sentences, and a command a reader copies
out — so layout is reviewed where it has to choose between the information a
ledger carries and the columns it lays out. Those frames are also snapshot at
a hundred columns, the width a working terminal usually has. A live scene is
reviewed over time as well as in one frame: a sequence of transcript
checkpoints cut from one recorded event log shows the same operation starting,
settling work, failing, and advancing phases, with committed lines still
present at later checkpoints. A fixture drawn from the design canvas is named
`<board>--<frame>`, so its snapshots can be held against the mock they
implement. Retained alternatives are separate fixtures only while they remain
useful review scenarios; superseded or semantically duplicate variants are
removed. A design change is reviewed by its snapshot diff.

## Renderer conformance

The renderer conformance suite in `apps/cli/src/test-support/conformance/` is
the acceptance gate for any painter behind the `Doc` seam. It runs each
registered `Painter` — today the production painter alone — over every settled
gallery document and recorded install event logs, and requires the
`vocabulary--` fixtures together to cover every node kind and non-text painter
fact, so a new node kind cannot land without the gallery showing it. The
[CLI live-event contract](../decisions/cli-live-event-contract.md) owns what
the suite asserts and why the seam is held this way.

## Design tools

The lab, `pnpm lab`, is the review aid for design work; it is not evidence,
and [Terminal UX development](../../../contributing/guides/terminal-ux.md)
describes how to use it. It serves the gallery as a person would review it:
every fixture viewed at the terminal's own size and repainted as the terminal
resizes or a source changes, sample questions driven key by key through their
own reducers, recorded operations replayed through the real `Screen`, the
source CLI run under a pseudo-terminal, and changed snapshots shown before and
after. Browsing the gallery asks the CLI's own `Pick` question, so reviewing
the design also exercises the prompt it ships.

One step grammar, defined in `@agentxm/test-support/key-steps`, drives a
prompt in process and under a pseudo-terminal alike. Each named key carries
both the bytes a terminal sends and the key readline decodes them as, so a
script presses the same keys in both.

## Terminal evidence

The gallery paints pure functions, so it reaches every state a scene or prompt
can hold but none of the terminal itself. Raw mode, key decoding, and the
cleanup that follows an interrupt exist only when stdin is a terminal, and a
prompt that leaves raw mode on or the cursor hidden breaks the shell it
returns to. The pseudo-terminal harness in `@agentxm/test-support/pty` runs
the built artifact under a real terminal of a declared size, replays waits and key
writes against it, and reports the exact bytes and resize points with whether
raw mode was handed back and the cursor left visible. Each interaction kind
proves its keys there; its states are proved in the gallery. Screen evidence
interprets those bytes with the headless terminal replay in
`@agentxm/test-support/terminal-replay`, because stripping ANSI would count
erased text as retained history.

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
| CI logs                     | Plain mode; transcript lines, no cursor movement, no animation, no color unless forced on a terminal                   |
| Narrow panes                | Ledgers stack when the columns they keep overflow; tables stack below forty; below twenty the painter paints at twenty |
| Short panes                 | The active region fits; committed history remains in scrollback; unusable controls fail with guidance                  |
| Piped or redirected streams | Unbounded plain text                                                                                                   |

## Time to first output

The first byte on stdout or stderr arrives within 300 ms at the median and
400 ms at p95 for `axm --version`, and a workspace listing's first byte meets
the same budget while its settled document arrives within 700 ms at p95 on a
warm cache. Startup dominates: the runtime and module loading cost roughly
250 ms before any command work, so the live frame must appear inside that
budget and a budget below it requires a startup change, not a presentation
change. These numbers are a maintained target, not a requirement: the
diagnostic benchmark in `benchmarks/cli/time-to-first-output.bench.ts`
measures them, `pnpm bench` runs it against the built CLI, and a change that
moves the trend is reviewed against the target. A required bound would become
a performance specification.
