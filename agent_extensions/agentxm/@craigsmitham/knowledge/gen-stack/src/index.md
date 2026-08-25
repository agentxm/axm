---
okf_version: "0.2"
---
# gen-stack

Gen Stack is an opinionated method for carrying software change from human
intent through authoritative Requirements, architecture, implementation,
evaluations, and operational feedback without confusing those representations
or allowing observations to rewrite intent automatically.

Begin with [The Gen Stack method](overview.md), then follow the part of the
change loop that owns the decision in front of you. The reusable architecture,
requirements-engineering, work-item, YAGNI, and Tidy First reference material
remains in the sibling software-architecture and software-engineering bundles;
this bundle owns their cross-cutting composition.

## Overview

- [The Gen Stack method](overview.md) - How one software-change method connects intent, authoritative Requirements, architecture, realization, evaluations, and operational feedback while preserving the distinct authority of each layer.

## Foundations

- [One authority, many witnesses](foundations/one-authority-many-witnesses.md) - Why an accepted Requirement has one normative authority while architecture, implementation, tests, evaluations, and telemetry may repeat its predicate for different purposes.
- [Pace layers and gradients of trust](foundations/pace-layers-and-gradients-of-trust.md) - How different rates of change and levels of confidence determine containment, observability, reversibility, and review.
- [Compaction and conceptual mass](foundations/compaction-and-conceptual-mass.md) - How to remove obsolete structure and compress accumulated understanding without discarding load-bearing intent or evidence routes.

## Change lifecycle

- [Intent-to-feedback loop](change-lifecycle/intent-to-feedback-loop.md) - How signals move through work items, Requirements, architecture, realization, evaluation, and operational feedback while preserving authority boundaries.
- [Analyzing Requirement impact](change-lifecycle/analyzing-requirement-impact.md) - How to classify a work item's possible effect on desired state before it becomes an unsupported requirement or implementation commitment.

## Assurance and regeneration

- [Evaluations and evidence](assurance-and-evidence/evaluations-and-evidence.md) - How evaluation definitions, executions, results, promoted evidence, and governance decisions relate to authoritative Requirements.
- [Bounded regeneration](design-and-change/bounded-regeneration.md) - How to make replaceable implementation layers earn regeneration through conservation boundaries, operational memory, and rollback.
- [Gen Stack adoption ladder](design-and-change/gen-stack-adoption-ladder.md) - A staged path from explicit authority to bounded regeneration without pretending the complete method is already proven everywhere.
