---
type: Decision
status: stable
description: AXM human results take typed shapes whose parts come in a fixed order, separators and general wording belong to the painter and one grammar module, every view is a pure module the gallery paints, and each frame update is one synchronized write.
depends-on:
  - ./cli-output-view-model-and-terminal-ownership.md
  - ./cli-ledger-grammar-and-application-owned-prompts.md
  - ../commands/terminal-design.md
  - ../commands/output.md
---

# CLI result shapes and one grammar

## Context and forces

The `Doc` vocabulary, the one painter, and the `Screen` gave AXM one output
architecture and one visual grammar, but the grammar's composition rules lived
in prose. A result's order — title line, ledger, conditions, verdict, `Next` —
its separators, its tense, and its wording were conventions each view
re-implemented. Commands built outside the shared operation view drifted:
settled titles mixed tenses, verdicts spelled three different separators in
one line, empty states took five shapes, and several commands printed every
fact as its own headline. The gallery reviewed the operation family closely
and most other commands not at all, so drift went unseen.

The remedy has to keep features free of terminal concerns, keep machine output
independent of the human document, and move rules out of prose and into types
and checks without adding a framework.

## Accepted choice

1. **Result shapes.** `apps/cli/src/screen/templates.ts` defines the shapes a
   human result takes — an operation result, an empty result, and a record —
   each a type whose parts come in a fixed order, with conditions typed as
   callouts. Inventories take the same parts through `inventoryDoc`. A view
   chooses the shape its result means and fills it; one title line,
   `titleDoc`, opens every result that carries a ledger or table.
2. **The painter owns separators.** Headline asides, callout asides, and
   summaries are lists of parts the painter joins with the glyph set's
   separator. A verdict is a claim and its facts; a consequence is the aside's
   first fact. Wrapping keeps a separator with the fact before it. The
   `axm-policy/no-spelled-separator` lint rule holds CLI sources to this.
3. **One grammar.** `apps/cli/src/screen/grammar.ts` owns the general forms
   every command shares: counts, lists, sizes, durations, dates, version moves,
   sentence case, and the fragment form of `Next` descriptions. The shared
   operation vocabulary stays in `screen/phrases.ts`; wording only one command
   speaks lives with that command.
4. **Views are pure modules the gallery paints.** A command's view is a module
   of its own, never a closure inside its handler, and
   `views-have-fixtures.test.ts` fails on a view module that no gallery fixture
   or sample imports unless it names why.
5. **One synchronized write per update.** The `Frame` composes each update and
   writes it once per stream; where it moves the cursor, the stderr bytes sit
   inside one DEC 2026 synchronized frame. Terminals known to draw OSC 9;4
   show taskbar progress while the active region holds anything.

This record amends and does not supersede the
[CLI output view model and terminal ownership](cli-output-view-model-and-terminal-ownership.md)
and [CLI ledger grammar and application-owned prompts](cli-ledger-grammar-and-application-owned-prompts.md)
decisions. [Terminal design](../commands/terminal-design.md) owns the rules
themselves.

Accepting authority: maintainer direction to adopt the CLI output coherence
review. Existing executable specifications keep their authority; the one
obligation this change alters, `cli/list/human-inventory-states-each-row`,
changed with it.

## Rationale

Order and presence that a type fixes cannot drift, and a rule enforced by a
type or a check no longer needs a paragraph of exceptions. Separators joined
by the painter follow ASCII mode and wrapping by construction. A single
grammar module makes "one fact, one form" reviewable in one place. A view the
gallery paints is a view someone reviews. Prior art agrees on each point: gh
routes all output through shared printers, Cargo and uv keep one status and
wording grammar, and Ink and Bubble Tea draw each frame inside synchronized
output.

## Material alternatives

- **Keep the rules in prose and add more snapshot tests.** Tests would catch
  regressions only where fixtures exist, which was the gap. Rejected.
- **A full component framework for results.** It would duplicate the painter
  and couple views to a framework the earlier decisions deferred. Rejected.
- **Enforce wording with a message catalog.** A catalog of every sentence
  fragments ownership away from features and does not fix order or
  separators. Rejected in favor of a small general grammar plus
  feature-owned phrases.
- **Query terminals for synchronized output and taskbar support.** A query
  needs a reply timeout on every invocation and most terminals do not answer
  the progress one. Rejected for markers that are harmless where unsupported
  and an allowlist for progress.

## Consequences

Positive:

- results read the same across commands by construction;
- separators, tense, and wording have one owner each, and lint enforces the
  separator rule;
- the gallery covers every view module or says why not; and
- repaints no longer flicker on terminals that support synchronized output.

Negative:

- check, show, upgrade, and share await sample builders before the gallery
  paints them;
- human wording changed in many commands at once, so tests and snapshots
  changed with it; and
- the taskbar progress allowlist needs maintenance as terminals adopt OSC 9;4.

## Supersession and reconsideration

Reconsider the shapes if a result cannot be expressed as one of them without
a new part; add the part to a shape rather than arranging nodes in a view.
Reconsider the progress allowlist when terminals offer a capability query.
Any superseding decision must keep machine output independent of the human
document and keep features free of terminal wording.
