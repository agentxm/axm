---
type: Architecture Decision Policy
title: AXM architecture decision policy
description: The threshold, authority, location, content, and reconsideration rules for
  accepted AXM architecture decisions.
status: stable
tags: [architecture-decisions, adr, governance]
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# AXM architecture decision policy

## Decision threshold

Record an Architecture Decision Record when a durable choice has cross-cutting
consequences, meaningful alternatives, or rationale that future maintainers
could not recover reliably from the resulting code, contracts, Requirements,
or Architecture. Ordinary reversible implementation choices remain with the
authorized change.

## Acceptance and supersession authority

Maintainer approval through the repository pull-request workflow accepts,
supersedes, or reopens an AXM architecture decision. Implementation activity,
document authorship, or automated review does not establish acceptance.

## Records and minimum content

Accepted ADRs live at `architecture/decisions/<decision>.md` in this corpus.
Create that collection only when the first decision is accepted. Each record
identifies one accepted choice, its context, rationale, material alternatives,
consequences, acceptance authority, and supersession or reconsideration
conditions.

## Reconsideration

Reconsider an accepted decision when a material assumption or constraint is
invalidated, evidence contradicts its intended consequence, an accepted
Requirement changes, the System boundary changes, or the original tradeoff no
longer fits AXM's lifecycle or assurance posture.
