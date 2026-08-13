# Lint

`axm lint` explains extension and workspace invariant violations. It
helps a person or agent understand what is invalid without guessing what they
intended or directing them through a recovery workflow.

## Responsibilities

Lint reads local authoritative and observed state and reports what is invalid.
Each finding identifies:

- a stable rule;
- severity and scope;
- the affected extension or workspace subject;
- the authoritative source and observed fact;
- the expected invariant; and
- relevant identities and locations.

Messages should be understandable without knowing AXM internals. They state the
problem and its context, not a command to run. Structured output preserves the
same facts and does not add suggested actions or recovery instructions.

## Non-responsibilities

Lint does not report general inventory, available updates, unpublished authored
content, registry availability, or predictions about whether an unrelated
command will succeed. It does not use the network.

Lint does not guess user intent, choose workspace configuration, install or
remove extensions, change trust or the lockfile, or reconcile agent projections.
Those responsibilities belong to the user, lifecycle commands, or sync.

## Rule behavior

Rules describe stable conditions rather than particular recovery commands. A
root-cause rule reports the primary violation; rules that depend on that failed
precondition skip instead of emitting cascade symptoms. Independent rules
continue so one broken area does not hide another.

Platform invariant errors cannot be disabled or lowered. Warnings may be
disabled, retained, or promoted. `--strict` makes warnings affect the exit code
without relabeling them as errors.

Local lint configuration affects local linting. The registry publish gate owns
its fixed distribution requirements and remains authoritative for publishing.

## Autofix boundary

`axm lint --fix` is limited to unambiguous, meaning-preserving normalization
of linted source or configuration. Examples may include standard formatting or
an unambiguous metadata normalization.

Autofix performs no network acquisition, lifecycle transition, trust or
lockfile change, projection work, or authority change. If a correction requires
guessing user intent or choosing desired state, it is not an autofix.

Fixing evaluates one stable snapshot, checks that every target still matches
that snapshot, applies all eligible fixes or none, reruns lint, and reports the
resulting findings. A stale target causes no writes.

## Testing strategy

Lint tests own the rule catalog and exact findings. Every shipped error needs a
recovery test that begins from valid state, introduces the smallest violation,
verifies root-cause reporting and permitted side effects, exercises the owning
recovery path, and ends valid. A completeness check should fail when a new error
lacks that coverage. Autofix tests additionally prove meaning preservation,
all-or-nothing application, and stale-target safety.
---

status: stable
description: Lint responsibilities, diagnostic behavior, autofix limits, and verification strategy.
---
