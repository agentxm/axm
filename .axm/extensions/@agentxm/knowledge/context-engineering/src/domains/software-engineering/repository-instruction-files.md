---
type: Explanation
title: Repository instruction files
description: Why repository instruction files form a scoped context system and how scope, applicability, composition, and precedence differ.
tags: [agents.md, claude.md, repository-instructions, always-on-context, scope, routing]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-15T20:45:15Z }
stale_after: 2027-02-15
sources:
  - id: agents-md
    resource: https://agents.md/
    title: AGENTS.md
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
---

# Repository instruction files

Repository instruction files such as `AGENTS.md`, `CLAUDE.md`, and related
rules provide persistent feedforward context for software work. Their cost and
effect are paid before the exact task is known, so they are appropriate for
stable invariants, high-value commands, non-obvious environment facts, and
concise discovery routes—not an encyclopedia of the codebase.

The open `AGENTS.md` convention describes the file as a predictable,
agent-focused counterpart to a human README.[^agents-md]

## Four useful jobs

| Job              | Example shape                                                    |
| ---------------- | ---------------------------------------------------------------- |
| Invariant        | Never edit generated output; change its canonical source         |
| Working command  | After changing this package, run its named validation target     |
| Discovery route  | Before changing migrations, read the migration guide             |
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

| Idea          | Question                                                     |
| ------------- | ------------------------------------------------------------ |
| Scope         | Where is this guidance intended to apply?                    |
| Applicability | Under what work does the source enter the effective context? |
| Composition   | Are applicable sources selected, combined, or ordered?       |
| Precedence    | What happens when applicable instructions conflict?          |

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

| Content                             | Typical action                               |
| ----------------------------------- | -------------------------------------------- |
| Universal invariant                 | Keep concise                                 |
| High-leverage trigger and route     | Protect or sharpen                           |
| Full procedure                      | Move to a skill or guide; retain the trigger |
| Explanation or reference            | Move to knowledge; retain a route if needed  |
| Parent duplication                  | Remove                                       |
| Mechanically enforceable convention | Promote to a check or schema                 |
| Stale or aspirational statement     | Correct, qualify, or retire                  |

## Audit finding classes

| Class                          | Signal                                         | Typical response                       |
| ------------------------------ | ---------------------------------------------- | -------------------------------------- |
| Duplicate body                 | Restates a guide or parent                     | Cut the copy and keep the route        |
| Procedure in always-on context | Long reusable how-to                           | Move it and leave a trigger            |
| Weak trigger                   | Topic label does not establish when to act     | Rewrite as a receivable condition      |
| Missing route                  | Agents repeatedly rediscover an existing owner | Add the smallest useful route          |
| Stale                          | Dead path, command, or superseded policy       | Correct or retire                      |
| Wrong layer                    | Local detail appears at broad scope            | Move to the nearest truthful owner     |
| Unjustified file               | Adds no distinct scoped guidance               | Remove after confirming no hidden role |
| Index over-cut risk            | A trim strands useful depth                    | Reject the cut or regroup routes       |

## Evaluate the effective surface

Treat instructions as an interface and test them from representative entry
points. Resolve the active harness contract from the consuming environment:
which sources it recognizes, their scopes, when they load, how they compose,
how conflicts resolve, and how the effective set can be inspected. Then test
both work that should receive narrower guidance and adjacent work that should
not.

Minimal high-signal context and just-in-time depth are generally safer than
accumulating every possibly useful fact.[^anthropic-context]

To create or revise a repository instruction surface, use
[How to author repository instruction files](authoring-repository-instruction-files.md).

[^agents-md]: AGENTS.md

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
