---
type: Guide
title: How to write a how-to guide
description: When someone needs directions for a task, turn their request into a guide they can follow and check against the result they need.
tags: [docs, how-to, guide, authoring, drafting, revision, diataxis]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T01:59:18Z }
sources:
  - id: diataxis
    resource: https://diataxis.fr/how-to-guides/
    title: Diátaxis — How-to guides
  - id: work
    resource: https://diataxis.fr/tutorials-how-to/
    title: Diátaxis — The difference between a tutorial and how-to guide
  - id: edtf
    resource: https://www.loc.gov/standards/datetime/
    title: Library of Congress — Extended Date/Time Format Specification
---

# How to write a how-to guide

Start with a request from someone doing the work. If you have a draft
already, find the request it was meant to answer. Keep the intended
result in view as you write and try the directions.

## 1. Name what the reader wants to finish

“Document the date field” could lead to an inventory of everything a
catalog can store. Suppose an archive volunteer has a narrower question.
They know how to enter a photo record, but the source note gives only
an estimated year. How should they enter it so the next researcher can
tell what the source actually says?

Title the page for that result, for example *Record a qualified year for
a photograph*. Begin with the source note and an open record. End when
the researcher can recover the qualification from the catalog entry.
If your reader wants a first experience of cataloging, a tutorial can
give them a practice record and guidance through the work.[^diataxis][^work]

## 2. Work through the task and capture the decisions

Do the job yourself or watch someone who does it. Record where a choice
changes the outcome. In this example, suppose the archive’s date field
accepts Level 1 of the Extended Date/Time Format (EDTF). The Library of
Congress specification distinguishes a possibly correct date, an
approximate date, and a date that is both approximate and uncertain.
Check that the actual catalog supports the notation before recommending
it there.[^edtf]

Assemble the inputs that expose those choices. “Possibly 1952” names a
candidate year. “Around 1952” locates the picture near a year. A draft
that tells both catalogers to “enter the best estimate” discards the
distinction at exactly the point where they need it.

## 3. Put the choice where the reader can act on it

Write the shared actions once. Give each branch a condition the reader can
recognize and an action they can carry out with the access and equipment
established for that setting. If a prerequisite is missing, tell the reader
what they need to obtain. Give exact recovery steps when you can establish
how that reader can recover. This passage could appear in the archive’s
guide.[^diataxis][^edtf]

> Read the wording of the source note. In the catalog’s EDTF date field,
> enter the year with the corresponding qualification.
>
> - “Possibly 1952” → `1952?`
> - “Around 1952” → `1952~`
> - “Possibly around 1952” → `1952%`
>
> Save the record, then open the entry as a researcher would see it.
> Compare the displayed date and its qualification with the source note.
> If the entry shows only the year, the researcher still lacks the
> qualification. Check whether the researcher can see it elsewhere in
> the record.

Name a standard, product, or organization where knowing its name helps the
reader make a choice. Here, “EDTF Level 1” tells the volunteer what support
to check for before entering `1952~`. When a source supports a practice
that carries across settings, describe the action in the reader’s terms
and cite the source beside it.

Where an unfamiliar detail obscures the next action, add enough context
for the reader to continue. Readers who need other date forms can consult the
format specification. If they keep asking why the archive distinguishes
uncertainty from approximation, give that question its own page. See
[How to write an explainer](writing-an-explainer.md).

## 4. Try the draft and revise where it leaves someone guessing

If the guide serves several settings, show its title and opening to someone
in another intended setting. Ask who they think it is for and what tools or
access they think it requires. If they mistake a worked example for a
prerequisite, introduce the task first and identify the example where it
begins.

Give the draft and sample notes to someone who does this work, if one is
available. When they pause, ask what they are deciding. A cataloger who
is weighing the wording of a source note is doing part of the job. Leave
that judgment with them. If they have settled on an approximate year and
are searching for the symbol to enter, put the notation where they make
the entry. Working alone, start again from the described inputs and
inspect the result from the next person’s point of view.

Try each route with a test record. If the catalog accepts `1952~` on
entry but later displays an unqualified “1952” to researchers, identify
where the qualification is retained and whether those readers can
retrieve it. The format specification tells you what the symbol means.
Only trying the archive’s catalog can establish what its readers see.
Revise the affected direction or record the unresolved limitation. For
a guide covering more than one system, say which paths you tried.

[^diataxis]: Daniele Procida, [How-to guides](https://diataxis.fr/how-to-guides/).
[^work]: Daniele Procida, [The difference between a tutorial and how-to guide](https://diataxis.fr/tutorials-how-to/).
[^edtf]: Library of Congress, [Extended Date/Time Format Specification](https://www.loc.gov/standards/datetime/), Level 1, “Qualification of a date (complete).”
