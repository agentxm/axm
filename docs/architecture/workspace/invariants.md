---
status: stable
description: How AXM represents workspace validity and proves that invalid states are recoverable.
depends-on:
  - ../principles.md
  - ./overview.md
---

# Workspace invariants

Workspace invariants describe what must be true across workspace configuration,
desired state, configured agents, workspace capabilities, resolutions, trust,
canonical extension content, inline configuration, and managed outputs.
Lint, sync, and commands use the same invariant facts for different purposes.

## Responsibilities

This document owns:

- the shared meaning of an invariant fact;
- the distinction between invariant violations and operational blockers;
- root-cause reporting and dependent-check suppression;
- how lint, sync, and command preflight consume facts; and
- the requirement that every reported error or blocker has a proven recovery.

## Non-responsibilities

This document does not list rules, findings, blocker codes, recovery commands,
or test cases. Rule catalogs, schemas, code, and behavior tests own those exact
contracts. Lint owns diagnostic presentation, sync owns reconciliation, and
intent commands own changes to workspace configuration.

## Invariant facts

An invariant fact records a durable mismatch between authoritative or derived
state and observed state. It identifies the affected subject, the authority on
which the expectation rests, what AXM observed, what must instead be true, and
the relevant identities or locations.

Facts do not prescribe user intent. The same fact remains true regardless of
whether a user later chooses sync, a lifecycle command, or a direct edit to
workspace-authored state.

Invariant evaluation is local and deterministic. A temporary network failure,
an unavailable registry, or a target changing after planning may block an
operation, but does not thereby become a workspace invariant violation.

## Shared consumers

| Consumer        | Use of invariant facts                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Lint            | Reports applicable violations without prescribing a recovery workflow.         |
| Sync            | Maps reconcilable facts to plan steps and other facts or evidence to blockers. |
| Intent commands | Preflight only the facts required for the extensions the command must change.  |

Lint and sync cannot disagree about the meaning of a shared fact. Sync may use
additional operational evidence needed to plan safe reconciliation; that
evidence does not silently expand lint's responsibilities.

Publish validation remains separate. It may reuse extension analysis, but its
fixed distribution requirements do not redefine local workspace validity.

## Authority facts

Authority facts distinguish conditions that a single catch-all lifecycle label
cannot:

- workspace-authored canonical content may exist outside desired state;
- configured agents and workspace capabilities come from settings rather than
  detection or existing native files;
- inline definitions are authoritative settings without requiring fabricated
  canonical content or a resolved extension version;
- externally acquired canonical content must remain related to accepted source
  and resolution evidence;
- an AXM-owned output must remain traceable to the extension and ownership unit
  that produced it;
- unowned native content may coexist only where the type contract establishes
  an independent boundary; and
- a required unit occupied by unowned content, or one whose authority is
  ambiguous, blocks only the affected work.

Observed name, path, or content equality may support a fact but cannot establish
authority by itself.

## Evaluation and isolation

A failed prerequisite suppresses checks whose conclusions would be unreliable
without it. Those checks do not emit secondary symptoms. Independent checks
continue so one invalid extension does not hide another.

A command is blocked only by invalid state relevant to the selected extension
and the other extensions that must change with it. Unrelated invalid state does
not become a global workspace gate.

## Recovery ownership

Every reported lint error and sync blocker has one demonstrated recovery owner:

- `lint --fix` for unambiguous, meaning-preserving normalization;
- sync for deterministic reconciliation of AXM-managed state;
- an intent command when the user must express a workspace choice; or
- direct correction of workspace-authored settings, manifests, or content.

Recovery ownership is a design and testing classification, not suggested
command metadata. Some states require a person or agent to choose the desired
outcome; AXM supplies the facts but does not make that choice.

## Testing strategy

A test-only recovery registry covers every lint error and sync blocker. A
completeness check fails when a new error or blocker lacks a recovery contract.

Each contract begins from valid state, introduces the smallest relevant
violation, verifies the primary facts and suppression of dependent symptoms,
exercises the owning recovery path, constrains permitted changes, forbids
unrelated or unowned changes, ends converged, and proves a second run makes no
further change.

The extension conformance suite covers independently coexisting unowned
content, a direct collision, ambiguous ownership evidence, stale AXM-owned
output, authored canonical inventory outside desired state, unreachable managed
content, and unclassifiable canonical content wherever those states apply.
Type-specific tests add the native merge, ordering, and fallback cases that a
shared fixture cannot express.

Workspace-surface tests additionally cover configured-agent transitions,
instruction-region and alias ownership, source-policy precedence, and inline
configuration without sourced-extension state.

Cross-cutting tests prove that handled failure leaves no partial work, unrelated
invalid state remains isolated, authored content is not incidentally deleted,
unowned content is not overwritten, sync does not change authored intent, and
lint fix performs no acquisition or projection work. They also cover stale and
concurrent plans, interruption, formatter-induced drift in external content,
replacement disclosure, and truthful partial progress.

Receipt history is not an invariant input. Metamorphic tests vary missing,
malformed, stale, and absent receipt rows while holding authoritative and
observed state fixed and require identical lint facts and business plans.

Minimized fixtures derived from real incidents are authoritative; live
repositories are used only for thin end-to-end confirmation.
