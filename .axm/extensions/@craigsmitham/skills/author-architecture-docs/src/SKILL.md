---
name: author-architecture-docs
description: Creates, revises, organizes, and reviews repository software architecture documentation that preserves accepted durable functional, quality, and structural meaning. Use when asked to write, update, migrate, organize, or review architecture docs, an architecture overview, system or subsystem responsibility documentation, or an architecture corpus. Not for choosing an architecture, evaluating alternatives, recording an unaccepted proposal or decision, researching current behavior as the requested output, auditing a documentation corpus, or implementing the system.
---

# Author architecture docs

Create the smallest architecture-documentation improvement that preserves the
accepted meaning needed to change a system safely without copying facts that
executable or live sources own better.

This skill is coupled to the software-engineering pack. From the active AXM
scope root, begin with
`.axm/extensions/@craigsmitham/knowledge/software-engineering/src/architecture/applying-just-enough-architecture-docs.md`.
Open only the additional concept needed for the current claim:

| Need | Concept under `architecture/` |
| --- | --- |
| Establish what architecture owns | `overview.md` |
| Apply or explain the corpus pattern | `just-enough-architecture-docs.md` |
| State responsibilities and exclusions | `responsibilities-and-non-responsibilities.md` |
| Describe authority, boundaries, or state ownership | `boundaries-authority-and-state.md` |
| Explain change isolation or dependency direction | `dependency-direction-and-change.md` |
| Define or express an invariant | `invariants-and-enforcement.md`, then `expressing-invariants.md` when authoring it |
| Select stakeholder concerns or views | `views-and-concerns.md` |
| Make a quality concern contextual and assessable | `quality-characteristics-and-architectural-concerns.md` |

## Workflow

1. **Resolve mode and authority.** Distinguish creation or revision from
   review-only work. Read repository instructions, the existing architecture
   corpus and its navigation, accepted decisions or requirements, and the
   executable or live sources needed to check material claims. Repository-local
   authority and required architecture formats take precedence.
2. **Confirm accepted meaning.** Architecture prose describes accepted desired
   state. Keep an unaccepted option, proposed decision, investigation, or
   delivery status in its own lifecycle. If a material responsibility,
   boundary, behavior, quality constraint, or tradeoff is undecided, name the
   gap and do not choose it merely to complete the document.
3. **Choose one cohesive subject.** Define the outcome or policy it owns, its
   exclusions, stakeholders, and system boundary. Follow useful local
   information architecture; do not create a feature, capability, component,
   or quality taxonomy for symmetry.
4. **Apply the admission test.** Include a claim only when it is accepted,
   consequential, durable through ordinary implementation change, difficult to
   infer reliably from executable or live sources, and worth maintaining.
   Remove or relocate proposals, procedures, inventories, and transient
   implementation detail that fail this test.
5. **Write only useful concern views.** Connect durable functional meaning and
   contextual quality concerns to responsibilities, authority, boundaries,
   dependencies, state, invariants, and accepted tradeoffs. Omit empty views.
   Explain why structure exists rather than cataloging components.
6. **Route precision to its owner.** Link tests and examples for exact
   scenarios, types and schemas for contracts, code and configuration for
   current implementation, and telemetry for observed operation. State what
   each link establishes; do not claim more evidence than it provides.
7. **Reconcile disagreement explicitly.** When prose and observed evidence
   differ, determine whether the implementation is wrong, the document is
   obsolete, the evidence is insufficient, or accepted intent changed. Do not
   let the newest artifact silently win. Stop when resolution requires a new
   product or architecture decision.
8. **Make and verify the authorized change.** For authoring, edit the bounded
   documentation and required navigation while preserving unrelated work. For
   review-only requests, return findings without edits. Reapply the admission
   test, verify claims and links against their authorities, run available docs
   checks, and inspect the diff for copied mechanics or collateral changes.
9. **Handoff.** State the subject and accepted meaning preserved, evidence
   checked, files changed or reviewed, and any unresolved decision, evidence
   gap, or reconciliation owner.

Do not change source code, configuration, runtime systems, proposals, or
external records unless the caller separately requests that work. A finished
document is concise enough to maintain, explicit enough to guide change, and
honest about the authorities that own its exact and current facts.
