---
type: Guide
title: How to write reference documentation
description: When readers repeatedly need exact details about a subject, organize them into entries they can locate, compare, and check.
tags:
- docs
- reference
- authoring
- interface
- lookup
- diataxis
status: draft
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:00:19Z'
sources:
- id: reference
  resource: https://diataxis.fr/reference/
  title: Diátaxis — Reference
- id: iter
  resource: https://docs.python.org/3/library/itertools.html
  title: Python — itertools
---

# How to write reference documentation

Take one concrete lookup request. Suppose a team has asked for a reference
to the iterator functions used in its reporting scripts.
Readers want to know what `islice(records, 2)` yields, and what happens
to the original iterator. Those questions give you a first entry to
draft and a way to test it.

## Decide what the reference covers and who defines it

Identify what readers need to look up and what source governs the answer.
For a bird club’s species codes, that might be a checklist adopted by the
club. For the reporting team, inventory the functions its scripts import
and check their entries against the installed Python release. Title the
page *Iterator functions used in our reports*. That title explains why a
function outside this small inventory may be absent. For a public API
reference, compare the inventory against the exported interface instead.
Keep any unresolved difference visible until the owner settles it.[^reference]

## Write the entry someone could land on directly

Use a name your readers recognize as the heading for an entry. Give
related entries consistent fields. For the reporting team, the call
forms, result, and constraints answer recurring questions. One example
settles what happens to the iterator.[^iter]

> `itertools.islice(iterable, stop)`
>
> `itertools.islice(iterable, start, stop[, step])`
>
> Yields selected items in input order, starting at zero by default and
> ending before the stopping position. A stop of `None` continues to the
> end of the input. Give nonnegative integers or `None` for the start
> and stop. The step takes a positive integer or `None` (the default
> step of one).
>
> After `from itertools import islice`, set `rows = iter(['oak', 'elm', 'ash'])`.
> Taking `list(islice(rows, 2))` yields `['oak', 'elm']`. The next item in
> `rows` is `'ash'`.

That final sentence supplies a fact a caller needs before reusing the
input. If the draft starts telling the programmer how to design the
report, move that work into the report-writing guide. Link it where
someone looking up the function might want to continue.[^reference]

## Test a lookup from the middle of the page

Start at the entry and answer the original lookup request using its text.
Check the answer against the source that governs the entry. For the bird
club, compare the species name and code with its adopted checklist. For
the reporting team, run the example with a fresh iterator, then vary the
argument that caused confusion. On a fresh copy of the same input,
`list(islice(rows, 2, None))` should yield only `['ash']`. Check the
limits against the supported version as well. A successful example
cannot establish every allowed argument.[^iter]

Repeat with a neighboring entry. Can a reader find the
corresponding fact in the same place? If the entries differ in a way that
matters to the reader, make the difference visible. Identify which change
in the authoritative source should prompt another check.

[^reference]: [Diátaxis — Reference](https://diataxis.fr/reference/).
[^iter]: [Python — itertools](https://docs.python.org/3/library/itertools.html).
