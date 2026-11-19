---
type: Principle
title: "Preserve agent judgment"
description: "Decide which constraints an agent needs and which choices it can make from the evidence at hand."
tags: ["agent instructions", "skills", "authoring", "review", "overprescription", "agent autonomy"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T02:15:37Z" }
sources:
  - id: trials
    resource: https://github.com/agentxm/axm/blob/ff0f7380d4b75d02ebfa362c4b23ee3fc9ad1ad1/skills/axe/evals/2026-11-18/README.md
    title: Skill discovery and execution trials
---

# Preserve agent judgment

State what a successful result requires. Supply the local facts, constraints,
and reasons the agent needs to choose a sound approach. Leave the method open
wherever multiple approaches would satisfy the request. When a particular step
matters, explain what depends on it.

This principle guides authors of agent instructions, skills, patterns, and CLI
help. An author knows things the agent might otherwise miss, such as which
artifact a customer receives or who may authorize publication. The agent, in
turn, can see what the user has already supplied and choose a method that fits
this particular request.

## What does the answer depend on?

Suppose a skill links to a migration guide. A user asks whether the link will
resolve after installation. The answer depends on the paths in the shipped
archive. A guide can exist in the checkout and still be missing from the
archive. With the archive in hand, the agent can inspect its entries. With the
link and a complete listing from that same archive already in the request, it
can resolve the path directly. With only the link text, package availability
remains an open question. Requiring an archive-listing command in all three
cases would prevent a sound answer in the second.

The same distinction applies to a user checkpoint. A request to review the
link authorizes inspection. Publishing a corrected package requires authority
to publish. Asking the user to choose a search tool before inspection spends
their attention on a decision they have already delegated.

## When to prescribe a method

A protocol may require one operation to finish before another begins. A user
may request an exact format because a downstream tool parses it. A repeated
failure may reveal an important condition the agent could not infer. In each
case, name the dependency and prescribe the part it warrants. Introduce a
worked command or report layout as an example wherever another method would
serve equally well.

Try the guidance on a nearby case that changes which route makes sense. In
one set of archive-review trials, a narrower routing instruction let the agent
reach the expected conclusions with one guide lookup per case instead of two.
The evidence was the verdict and the work needed to reach it. An instruction's
word count alone tells an author little about either.[^trials]

[^trials]: Skill discovery and execution trials, “Review a migration-guide reference.”
