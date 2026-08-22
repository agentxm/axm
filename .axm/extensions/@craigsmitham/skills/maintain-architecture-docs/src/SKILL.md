---
name: maintain-architecture-docs
description: Reviews and maintains established repository software architecture docs through evidence-aware repair and explicitly authorized semantic lifecycle changes. Use when asked to maintain, review, refresh, reconcile, clean up, prune, or assess stale, broken, duplicated, or contradictory architecture documentation. Not for initial setup, authoring a known new architecture subject, choosing an architecture, generic documentation work, or implementing the system.
---

# Maintain architecture docs

Keep established architecture docs coherent, discoverable, current enough to
trust, and small enough to justify their continuing maintenance.

This skill is a non-standalone member of the software-architecture pack. From
the active AXM scope root, begin with
`.axm/extensions/@craigsmitham/knowledge/software-architecture/src/architecture-documentation/just-enough-architecture-docs.md`.
Open `guides/organizing-an-architecture-docs-corpus.md` when maintaining
navigation or collection structure, and open only the additional architecture
concept needed to evaluate a material claim.
For a Product Quality Requirement, open
`guides/documenting-product-quality-requirements.md` and its linked foundation.

## Maintenance triggers

Use this workflow when requested, or when the requested review follows a change
to accepted behavior, responsibility, boundary, Product Quality Requirement,
architecture consequence, evidence route, navigation, or time-sensitive
strategic claim. Do not manufacture a fixed review cadence where the repository
has not accepted one.

## Workflow

1. **Resolve mode and authority.** Treat requests to review, assess, or report
   as read-only. A general request to maintain, repair, refresh, reconcile,
   clean up, or prune authorizes bounded mechanical integrity repair and
   unambiguous restoration of already accepted meaning. It does not by itself
   authorize semantic addition, deletion, merger, deprecation,
   reclassification, changed authority, or changed lifecycle. Perform those
   only when the user explicitly authorizes that class and scope; otherwise
   recommend them. State the mode before acting. Do not broaden review into
   remediation.
2. **Resolve the established scope.** Read repository instructions, the
   architecture root and its navigation, local adoption choices, applicable
   formats or profiles, and the accepted sources that govern the selected
   system. If no architecture-doc setup exists, report that precondition rather
   than silently initializing one.
3. **Inventory proportionately.** Within the requested system or documentation
   boundary, trace maintained subjects from the root; inspect inbound and
   outbound relationships, lifecycle or freshness metadata, and the executable
   or live evidence needed to check material claims. Use recent changes only to
   focus investigation; recency does not decide authority.
4. **Assess each maintained subject.** Check whether:
   - its substantive claims still pass the admission test;
   - accepted desired state remains distinct from proposals, delivery state,
     current implementation, and observed operation;
   - one canonical document owns each maintained element;
   - every independently addressable concept has a stable named file rather
     than sharing a plural catch-all document;
   - relationships, containment, and navigation remain coherent;
   - functional meaning, Product Quality Requirements, architecture, and
     evidence remain distinguishable without forced empty sections or a
     mandatory Product Quality View;
   - each maintained Product Quality Requirement remains accepted,
     architecture-significant, classified beneath one primary ISO/IEC 25010
     characteristic and subcharacteristic, and connected to its target,
     architectural consequences, and authoritative assessment route;
   - evidence routes still resolve and support no stronger claim than they
     establish;
   - time-sensitive claims have a usable review boundary;
   - system lifecycle, maintenance and decision authority, and review triggers
     are discoverable while lower-level docs repeat only consequential
     exceptions; and
   - the document still repays its comprehension, discovery, and maintenance
     cost.
5. **Classify before changing.** Classify each issue as one of:
   - mechanical integrity repair;
   - accepted semantic maintenance;
   - consolidation, deprecation, or removal;
   - authority disagreement;
   - unresolved architecture decision;
   - insufficient evidence; or
   - no action.

   Do not collapse disagreement into staleness. When prose and current evidence
   differ, determine whether the implementation is wrong, the docs are
   obsolete, evidence is insufficient, or accepted intent changed.
6. **Act only in maintain mode and within evidence.** Repair navigation, links,
   metadata, and relationships when the correct state is unambiguous. Revise
   existing semantic content only when accepted authority establishes the
   intended meaning and the request authorizes semantic revision. Merge,
   deprecate, remove, reclassify, or migrate material only when canonical
   ownership and supersession are clear and the user explicitly authorizes the
   relevant lifecycle change; otherwise present the proposed action. Replace
   copied mechanics with evidence routes only when reduction is explicitly in
   scope; otherwise recommend the smallest reduction. Never invent a missing
   decision merely to clear a finding.
7. **Preserve the authoring boundary.** Maintenance may restore accepted
   meaning in an existing subject, but a known new architecture subject or a
   separately requested substantive design change belongs to
   `author-architecture-docs`. Record that follow-up without requiring
   cross-skill invocation to finish the current maintenance scope.
8. **Verify.** Reapply the admission test to changed claims, confirm every
   maintained subject remains reachable from the root, check canonical homes
   and evidence routes, run applicable docs or profile checks owned by this
   pack, and inspect the diff for silent decisions, copied mechanics, and
   collateral changes.
9. **Handoff.** State the system, scope, and mode; subjects reviewed; evidence
   checked; repairs and lifecycle changes made; retained positive practices;
   and unresolved decisions, authority disagreements, or evidence gaps with
   their needed owner. Ground each recommended semantic addition, reduction,
   or revision in its evidence, omission risk, maintenance or drift cost,
   smallest safe change, and required authority.

Do not change source code, configuration, runtime systems, proposals, or
external records unless separately requested. Maintenance succeeds when every
identified issue in scope is either responsibly repaired or explicitly
classified without turning uncertainty into accepted architecture.
