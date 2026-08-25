---
type: Explanation
title: Agent instruction files
description: Why agent instruction files such as AGENTS.md and CLAUDE.md form a scoped context system, and how scope, applicability, composition, and precedence differ.
tags: [agent-instructions, instruction-files, agents.md, claude.md, persistent-context, always-on-context, scope, routing, precedence]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-24T13:32:38Z }
stale_after: 2027-02-24
sources:
  - id: agents-md
    resource: https://agents.md/
    title: AGENTS.md
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: context-files-evaluation
    resource: https://arxiv.org/abs/2602.11988
    title: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
  - id: context-files-efficiency
    resource: https://arxiv.org/abs/2601.20404
    title: On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents
  - id: probe-and-refine
    resource: https://arxiv.org/abs/2606.20512
    title: Probe-and-Refine Tuning of Repository Guidance for Coding Agents
---

# Agent instruction files

An **agent instruction file** is persistent feedforward context that a harness
loads for a scope without requiring the caller to restate it for every task.
"File" is a common storage form; the informational role is the defining
property. In software work these are surfaces such as `AGENTS.md`, `CLAUDE.md`,
and related rule files.

Their cost and effect are paid before the exact task is known, so they suit
stable invariants, high-value commands, non-obvious environment facts, and
concise discovery routes—not an encyclopedia of the codebase. The governing
question is:

> Must the agent know this throughout the scope, or does it need a reliable
> route only when a narrower situation occurs?

Keep the former concise. Put the latter behind progressive disclosure.

The open `AGENTS.md` convention describes the file as a predictable,
agent-focused counterpart to a human README.[^agents-md]

## Four useful jobs

| Job | Example shape |
| --- | --- |
| Invariant | Never edit generated output; change its canonical source |
| Working command | After changing this package, run its named validation target |
| Discovery route | Before changing migrations, read the migration guide |
| Environment fact | Integration tests require a local service started by this script |

Background essays, exhaustive alternatives, long workflows, and task backlogs
belong on demand.

## A scoped context system

Instruction systems commonly expose broader and narrower scopes. A useful
conceptual model is:

```text
broad-scope instructions
  └─ project-scope instructions
       └─ local-scope instructions
```

This is a model of intended applicability, not a universal discovery chain.
The active harness determines which sources it recognizes, when it loads them,
how it assembles them, and whether conflicts have deterministic precedence.
Directory ancestry is a common expression of specificity, but a harness may
also use path patterns, conditional selection, imports, lazy loading, or only
one broad and one project scope.

Four ideas must remain distinct:

| Idea | Question |
| --- | --- |
| Scope | Where is this guidance intended to apply? |
| Applicability | Under what work does the source enter the effective context? |
| Composition | Are applicable sources selected, combined, or ordered? |
| Precedence | What happens when applicable instructions conflict? |

A narrower source is not inherently stronger merely because it is closer to
the work. Specificity establishes an authoring intention; the consuming
harness establishes runtime behavior.

## Scope as ownership

Broad scopes should own only guidance that is true throughout their reach.
Narrower scopes should own genuine local differences rather than repeat their
parents. A local instruction file earns its existence when the work beneath it
has distinct constraints, commands, environment facts, or discovery routes—not
because every directory should mirror the repository tree with instructions.

Repeated guidance needs one authoritative owner. When a host requires several
compatible surfaces, imports, projections, or other explicit synchronization
are safer than independently maintained copies.

## Instruction files as maps

```text
instruction surface
├─ invariants and operating facts
└─ discovery routes
   ├─ knowledge       facts and explanation
   ├─ skills/guides   reusable workflows
   ├─ tools           observation and action
   └─ checks          deterministic enforcement and feedback
```

A route should name when to act, not only a topic. “Before adding a migration,
read …” is more receivable than “Database documentation.” The route keeps the
always-on surface small without stranding the depth an agent may need.

Instructions influence reasoning; they do not make mechanically decidable
properties deterministic. Reusable procedures belong in skills or guides,
explanation and reference in knowledge, external capabilities in tools, and
enforceable conventions in checks, schemas, or policy controls. The
instruction surface may route to those owners.

## Trim content, protect discovery

| Content | Typical action |
| --- | --- |
| Scope-wide invariant | Keep concise |
| High-leverage trigger and route | Protect or sharpen |
| Full procedure | Move to a skill or guide; retain the trigger |
| Explanation or reference | Move to knowledge; retain a route if needed |
| Parent duplication | Remove |
| Mechanically enforceable convention | Promote to a check or schema |
| Stale or aspirational statement | Correct, qualify, or retire |

## Audit finding classes

| Class | Signal | Typical response |
| --- | --- | --- |
| Duplicate body | Restates a guide or parent | Cut the copy and keep the route |
| Procedure in always-on context | Long reusable how-to | Move it and leave a trigger |
| Weak trigger | Topic label does not establish when to act | Rewrite as a receivable condition |
| Missing route | Agents repeatedly rediscover an existing owner | Add the smallest useful route |
| Stale | Dead path, command, or superseded policy | Correct or retire |
| Wrong layer | Local detail appears at broad scope | Move to the nearest truthful owner |
| Unjustified file | Adds no distinct scoped guidance | Remove after confirming no hidden role |
| Unproven accretion | Content was added without representative behavioral evidence | Evaluate against a smaller or absent-guidance baseline; retain, revise, or remove |
| Index over-cut risk | A trim strands useful depth | Reject the cut or regroup routes |

## Evaluate the effective surface

Treat instructions as an interface and test them from representative entry
points. Resolve the active harness contract from the consuming environment:
which sources it recognizes, their scopes, when they load, how they compose,
how conflicts resolve, and how the effective set can be inspected. Then test
both work that should receive narrower guidance and adjacent work that should
not.

Minimal high-signal context and just-in-time depth are generally safer than
accumulating every possibly useful fact.[^anthropic-context] Repository studies
do not support a universal verdict that instruction files help or hurt. One
study found generated context files increased work and cost without a
significant success improvement; another associated repository instructions
with lower median runtime and output-token use at comparable completion; and a
narrow study found failure-refined repository guidance outperformed both its
static starting point and an unguided baseline.[^context-files-evaluation][^context-files-efficiency][^probe-and-refine]
The production method, task
distribution, model, host, and measures are therefore part of the claim.

Treat every addition as a behavioral hypothesis. Correct discovery, loading,
scope, and adherence are necessary interface evidence, but they do not establish
that the guidance improves work. Start with the smallest sufficient surface and
retain a change only when representative evaluation shows useful outcome or
efficiency value without unacceptable safety, cost, trajectory, or adjacent-task
regression. Re-evaluate after material changes to the model, harness, tools,
repository, or effective context.

To create or revise an agent instruction surface, use
[How to author agent instruction files](authoring-agent-instruction-files.md).

[^agents-md]: AGENTS.md
[^anthropic-context]: Anthropic — Effective context engineering for AI agents
[^context-files-evaluation]: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
[^context-files-efficiency]: On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents
[^probe-and-refine]: Probe-and-Refine Tuning of Repository Guidance for Coding Agents
