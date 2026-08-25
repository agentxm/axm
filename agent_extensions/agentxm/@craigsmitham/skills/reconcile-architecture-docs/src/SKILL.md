---
name: reconcile-architecture-docs
description: Assesses and reconciles established OKF v0.2 software architecture docs against the required software-architecture-docs profile, including the mandatory System and context kernel, subject-colocated Requirements, and atomic ADRs. Use when asked to reconcile, maintain, review, refresh, repair, migrate, clean up, prune, or assess stale, broken, duplicated, contradictory, or nonconforming architecture documentation. Not for initial setup or profile adoption, authoring a known new architecture subject, choosing an architecture, generic documentation work, or implementing the system.
---
# Reconcile architecture docs

Reconcile established architecture docs so they remain coherent, discoverable,
current enough to trust, and small enough to justify their continuing
maintenance while conforming to OKF v0.2 and the required
`software-architecture-docs` profile.

This skill is a non-standalone member of the Gen Stack pack. From
the active AXM scope root, begin with
`knowledge/software-architecture/src/architecture-documentation/just-enough-architecture-docs.md`.
Always open
`architecture-documentation/software-architecture-application-profile.md` for
the current required identity, conformance, and validation contract.
Open `guides/organizing-an-architecture-docs-corpus.md` when maintaining
navigation or collection structure, and open only the additional architecture
concept needed to evaluate a material claim.
For a Requirement, open `guides/documenting-requirements.md`; for a quality
specialization, also open `guides/documenting-product-quality-requirements.md`.
Read `knowledge/gen-stack/src/foundations/one-authority-many-witnesses.md` when
reviewing duplication, tests, evaluations, or observed contradictions.

## Reconciliation triggers

Use this workflow when requested, or when the requested review follows a change
to accepted behavior, responsibility, boundary, Requirement,
architecture consequence, evidence route, navigation, or time-sensitive
strategic claim. Do not manufacture a fixed review cadence where the repository
has not accepted one.

## Workflow

1. **Resolve mode and authority.** Treat requests to review, assess, or report
   as read-only review mode. A general request to reconcile, maintain,
   repair, refresh, clean up, or prune authorizes reconcile mode: bounded
   mechanical integrity repair and unambiguous restoration of already accepted
   meaning. It does not by itself authorize semantic addition, deletion,
   merger, deprecation, reclassification, changed authority, or changed
   lifecycle. Perform those only when the user explicitly authorizes that class
   and scope; otherwise
   recommend them. State the mode before acting. Do not broaden review into
   remediation.
2. **Resolve the established scope.** Read repository instructions, the
   architecture root and its navigation, the required profile identity and
   version, profile-permitted local choices, and the accepted sources that
   govern the selected system. If no architecture-doc setup or explicit current
   profile adoption exists, report the setup or migration precondition rather
   than silently initializing one or accepting an alternate format.
3. **Inventory proportionately.** Within the requested system or documentation
   boundary, trace maintained subjects from the root; inspect inbound and
   outbound relationships, lifecycle or freshness metadata, and the executable
   or live evidence needed to check material claims. Establish separate OKF
   v0.2 and profile results, preserving `unknown` where evidence cannot decide.
   Use recent changes only to focus investigation; recency does not decide
   authority.
4. **Assess each maintained subject.** Check whether:
   - its type, metadata, path, containment, and navigation satisfy the required
     profile without a repository-local waiver;
   - its architecture claims still pass the architecture-description admission
     test and its Requirements remain accepted obligations in governed scope;
   - accepted desired state remains distinct from proposals, delivery state,
     current implementation, and observed operation;
   - one canonical document owns each maintained element;
   - every independently addressable concept has a stable named file rather
     than sharing a plural catch-all document;
   - relationships, containment, and navigation remain coherent;
   - functional meaning, Requirements, architecture, and
     evidence remain distinguishable without forced empty sections or a
     mandatory Product Quality View;
   - each maintained Requirement remains accepted, has a stable unique ID,
     uses one valid requirement type, is colocated beneath its explicit
     eligible subject, and has proportionate source or derivation traceability;
   - every load-bearing accepted obligation of the documented System or an
     eligible architecture subject has one Requirement authority rather than
     remaining embedded or duplicated as a second normative invariant, guarantee, prohibition,
     boundary rule, required failure or recovery outcome, binding dependency
     direction, use-case sentence, ADR consequence, or architecture policy;
   - evidence routes still resolve and support no stronger claim than they
     establish;
   - time-sensitive claims have a usable review boundary;
   - `system.md`, `lifecycle.md`, `ownership.md`, `decisions.md`, and `assurance.md` exist at
     the root, satisfy their distinct semantic contracts, and remain reachable;
   - justified absence is bounded and authoritative rather than an empty,
     placeholder, TODO, or unexplained `none` statement;
   - every local Architecture Decision Record is an accepted named concept
     under `decisions/`, proposals remain outside that collection, and
     `decisions.md` owns only the policy;
   - every binding limitation is a subject-colocated Requirement with
     `requirement_type: constraint`, and superseded Architecture Constraint,
     Product Quality Requirement, `constraints/`, and `quality/` forms are absent;
   - lifecycle, ownership, decision-policy, and assurance meaning is not
     duplicated in an overview, C4 system, lower-level element, or generic
     risk-driver summary except for meaningful links and consequential
     exceptions; and
   - the document still repays its comprehension, discovery, and maintenance
     cost.
5. **Classify before changing.** Classify each issue as one of:
   - base OKF or profile nonconformance;
   - mechanical integrity repair;
   - accepted semantic maintenance;
   - consolidation, deprecation, or removal;
   - authority disagreement;
   - implementation non-satisfaction;
   - stale or faulty evaluation;
   - ambiguous, obsolete, or incorrect Requirement;
   - changed external condition or accepted intent;
   - unresolved architecture decision;
   - insufficient evidence; or
   - no action.

   Do not collapse disagreement into staleness. When authority and current
   evidence differ, preserve the contradiction and determine which of the
   listed classes the available authority establishes.
6. **Act only in reconcile mode and within evidence.** Repair navigation, links,
   metadata, and relationships when the correct state is unambiguous. Revise
   existing semantic content only when accepted authority establishes the
   intended meaning and the request authorizes semantic revision. Merge,
   deprecate, remove, reclassify, or migrate material only when canonical
   ownership and supersession are clear and the user explicitly authorizes the
   relevant lifecycle change; otherwise present the proposed action. Replace
   copied current mechanics with evidence routes only when reduction is explicitly in
   scope; otherwise recommend the smallest reduction. Do not delete a test or
   evaluation merely because it repeats a Requirement predicate; preserve it
   as a distinct witness when it references the stable ID. Never invent a missing
   lifecycle, owner, policy, assurance obligation, decision, or Requirement
   merely to clear a finding. Treat extraction from an overview, conversion to
   an ADR or Requirement, migration of a hidden obligation to its canonical
   Requirement owner, and acceptance of a “none required” conclusion as
   semantic changes rather than mechanical profile repair.
7. **Preserve the authoring boundary.** Reconciliation may restore accepted
   meaning in an existing subject, but a known new architecture subject or a
   separately requested substantive design change belongs to
   `author-architecture-docs`. Record that follow-up without requiring
   cross-skill invocation to finish the current reconciliation scope.
8. **Verify.** Reapply the architecture-description admission test to changed
   architecture claims and the Requirement contract to accepted obligations, confirm the five
   required root concepts and every maintained optional subject remain
   reachable from the root, check canonical homes, conditional collection
   rules, one normative owner for every accepted obligation, retained distinct
   evaluation witnesses, and evidence
   routes, and run the base OKF and installed profile checks
   owned by their established authorities. Report their results independently
   and retain `unknown` when a check is unavailable or evidence is
   insufficient.
   Inspect the diff for silent decisions, copied mechanics, local waivers, and
   collateral changes.
9. **Handoff.** State the system, scope, and mode; subjects reviewed; evidence
   checked; repairs and lifecycle changes made; retained positive practices;
   and unresolved decisions, authority disagreements, or evidence gaps with
   their needed owner. Ground each recommended semantic addition, reduction,
   or revision in its evidence, omission risk, maintenance or drift cost,
   smallest safe change, and required authority.

Do not change source code, configuration, runtime systems, proposals, or
external records unless separately requested. The reconciliation workflow may
complete when every identified issue in scope is responsibly repaired or
explicitly classified without turning uncertainty into accepted architecture.
The corpus itself is conforming only when both OKF v0.2 and profile results
pass; a classified failure or `unknown` must remain visible and must not be
described as successful corpus reconciliation.
