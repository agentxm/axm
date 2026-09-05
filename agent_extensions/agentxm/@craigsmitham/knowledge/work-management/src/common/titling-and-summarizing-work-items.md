---
type: Guide
title: Titling and summarizing work items
description: Use when a work item must be recognizable in lists and search without changing its underlying body meaning.
tags: [work-item, title, summary, brief, search, list-view]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Titling and summarizing work items

The title and summary are a derived brief for readers who encounter the item in
lists, search, notifications, and relationships before opening it. Revising the
brief does not change the underlying evidence, classification, priority,
assignment, lifecycle, or body meaning.

## Write the title

Name the affected behavior, artifact, service, or bounded outcome and the
distinguishing condition or result. Prefer concrete language that separates the
item from its neighbors. Do not lead with a tracker label, priority, team name,
or implementation mechanism unless it is the enduring subject.

Useful role patterns include:

- Defect Report: `<subject> <observed result> when <condition>`
- Change: `<verb> <bounded outcome>`
- Incident Record: `<affected service or capability> <current impact>`

These are prompts, not mandatory grammar.

## Write the summary

Use one or two sentences. State why the item exists and its current meaningful
boundary before describing a proposed response. Preserve uncertainty and do
not add a root cause, decision, priority, or result absent from the body.

Derive both title and summary after substantive authoring, and re-derive them
when the item's meaning changes. Place the summary in the host's native field or
at the start of the body, but do not maintain two divergent copies.
