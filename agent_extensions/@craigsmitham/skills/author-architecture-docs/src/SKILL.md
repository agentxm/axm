---
name: author-architecture-docs
description: Creates, revises, organizes, and reviews explicitly requested repository software architecture concepts as a concise semantic delta within a required OKF v0.2 and software-architecture-docs profile corpus. Use for system lifecycle, ownership, decision policy, assurance, accepted ADRs, binding constraints, offerings, audiences, needs, jobs to be done, value propositions, use cases, product quality requirements, capabilities, features, surfaces, DDD bounded contexts, C4 systems/containers/components, Wardley views, and documentation structure. Not for initial architecture-doc setup or profile adoption, maintaining an established corpus, choosing an architecture, recording an unaccepted proposal as architecture, or implementing the system.
---

# Author architecture docs

Create the smallest architecture-documentation improvement that preserves the
accepted meaning needed to change a system safely without copying facts that
executable or live sources own better.

This skill is coupled to the software-architecture pack. From the active AXM
scope root, choose the narrowest route below. For a named profile artifact,
open its focused guide first; that guide routes to the normative profile and
relevant foundation. Use the corpus-organization guide only when the requested
artifact is the multi-view corpus itself; setup and ongoing maintenance belong
to their dedicated skills. The bundle root is
`.axm/extensions/@craigsmitham/knowledge/software-architecture/src/`.
Always read
`architecture-documentation/software-architecture-application-profile.md`
for its current identity, conformance, corpus-wide, path, and validation rules;
focused guides supply the narrower semantic procedure.

The bundle currently labels itself Candidate, and its concept documents remain
draft and not human-verified. That maturity label limits confidence in its
semantic guidance; it does not make the installed profile's normative
representation rules optional. Let accepted repository-local architecture
authority govern meaning, and let the installed profile govern representation.
Every Just Enough Architecture Docs corpus must conform to OKF v0.2 and the
installed application profile; exact concept types, paths, navigation,
metadata, containment, and permitted variance are therefore mandatory. A local
instruction to retain another form cannot waive that requirement. Initial
adoption or migration from unprofiled architecture material belongs to setup,
not to an ordinary authoring task; preserve such material unchanged and return
that setup precondition instead of drafting a nonconforming replacement. Name
and route both required steps: adoption or migration to OKF v0.2, and adoption
or migration to the current `software-architecture-docs` profile.

## Same-pack workflow boundary

| Request                                                                                                                    | Owning skill                  |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Plan or establish initial adoption, map systems to corpora, or connect discovery and authority                             | `setup-architecture-docs`     |
| Create, revise, organize, or review one explicitly requested architecture artifact or bounded subject                      | `author-architecture-docs`    |
| Assess or repair an established corpus for staleness, contradiction, duplication, broken navigation, or semantic lifecycle | `reconcile-architecture-docs` |

Choose the narrowest owner. A request that genuinely contains more than one of
these jobs may be sequenced only after each job and its authority are explicit;
shared pack membership alone does not authorize composition.

| Need                                                                                                          | Concept path from the bundle root                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Author or revise system lifecycle                                                                             | `guides/documenting-system-lifecycle.md`                                                              |
| Author or revise system ownership                                                                             | `guides/documenting-system-ownership.md`                                                              |
| Author or revise architecture decision policy                                                                 | `guides/documenting-architecture-decision-policies.md`                                                |
| Author or revise system assurance                                                                             | `guides/documenting-system-assurance.md`                                                              |
| Record one accepted architecture decision                                                                     | `guides/documenting-architecture-decision-records.md`                                                 |
| Document one binding architecture constraint                                                                  | `guides/documenting-architecture-constraints.md`                                                      |
| Understand what this knowledge bundle owns                                                                    | `overview.md`                                                                                         |
| Apply or explain the architecture-doc pattern                                                                 | `architecture-documentation/just-enough-architecture-docs.md`                                         |
| State or review responsibilities, exclusions, authority, boundaries, state ownership, or dependency direction | `guides/reviewing-responsibilities-with-scenarios.md`                                                 |
| Define or express an invariant                                                                                | `foundations/invariants-and-enforcement.md`, then `guides/expressing-invariants.md` when authoring it |
| Select stakeholder concerns or documentation views                                                            | `architecture-documentation/just-enough-architecture-docs.md`                                         |
| Author one Product Quality Requirement                                                                        | `guides/documenting-product-quality-requirements.md`                                                  |
| Author one Offering                                                                                           | `guides/documenting-offerings.md`                                                                     |
| Author one Audience                                                                                           | `guides/documenting-audiences.md`                                                                     |
| Author one Need                                                                                               | `guides/documenting-needs.md`                                                                         |
| Author one Job to Be Done                                                                                     | `guides/documenting-jobs-to-be-done.md`                                                               |
| Author one Value Proposition                                                                                  | `guides/documenting-value-propositions.md`                                                            |
| Author one Use Case                                                                                           | `guides/documenting-use-cases.md`                                                                     |
| Author one Capability                                                                                         | `guides/documenting-capabilities.md`                                                                  |
| Author one Feature                                                                                            | `guides/documenting-features.md`                                                                      |
| Author one Surface                                                                                            | `guides/documenting-surfaces.md`                                                                      |
| Author one Subdomain                                                                                          | `guides/documenting-subdomains.md`                                                                    |
| Author one Bounded Context                                                                                    | `guides/documenting-bounded-contexts.md`                                                              |
| Author one Context Map                                                                                        | `guides/documenting-context-maps.md`                                                                  |
| Author one C4 Software System                                                                                 | `guides/documenting-c4-software-systems.md`                                                           |
| Author one C4 Container                                                                                       | `guides/documenting-c4-containers.md`                                                                 |
| Author one C4 Component                                                                                       | `guides/documenting-c4-components.md`                                                                 |
| Author one C4 View                                                                                            | `guides/documenting-c4-views.md`                                                                      |
| Clarify offerings, audiences, needs, value propositions, or use cases                                         | `foundations/offerings-and-value.md`                                                                  |
| Clarify jobs, circumstances, forces of progress, or job maps                                                  | `foundations/jobs-to-be-done.md`                                                                      |
| Clarify product quality, ISO/IEC 25010 classification, architecture significance, measures, or evidence       | `foundations/product-quality.md`                                                                      |
| Clarify capabilities, features, applications, or actor-facing surfaces                                        | `foundations/capabilities.md`                                                                         |
| Clarify DDD concepts and their relationships                                                                  | `foundations/domain-driven-design.md`                                                                 |
| Clarify C4 abstractions, diagrams, dynamics, deployment, or shared modules                                    | `foundations/c4-model.md`                                                                             |
| Connect strategy, evolution, sourcing, or inertia to architecture                                             | `foundations/wardley-mapping.md`                                                                      |
| Organize a multi-view architecture docs corpus                                                                | `guides/organizing-an-architecture-docs-corpus.md`                                                    |

## Workflow

1. **Resolve mode and authority.** Distinguish creation or revision from
   review-only work. Read repository instructions, the existing architecture
   docs and their navigation, accepted decisions or requirements, and the
   executable or live sources needed to check material claims. Repository-local
   authority governs accepted meaning, while the installed profile governs its
   representation. If the corpus is not OKF v0.2 or does not explicitly adopt
   the current profile, preserve the material and route both required adoption
   or migration steps to `setup-architecture-docs`; do not author into an
   invalid alternative form.
   Route established corpus-wide profile violations to
   `reconcile-architecture-docs`. A validation result that is unavailable or
   cannot decide remains `unknown` in the handoff rather than becoming a
   different workflow or an inferred pass.
2. **Confirm accepted meaning.** Architecture prose describes accepted desired
   state. Keep an unaccepted option, proposed decision, investigation, or
   delivery status in its own lifecycle. If a material responsibility,
   boundary, behavior, quality constraint, or tradeoff is undecided, name the
   gap and do not choose it merely to complete the document.
3. **Choose the system, subject, and view.** Define the system of interest, then
   the outcome or policy the subject owns, its exclusions, and stakeholders.
   Distinguish offerings and value, capabilities, features, surfaces, domain
   contexts, and C4 elements; connect them with explicit relationships instead
   of one false hierarchy. Follow the focused guide and normative profile for a
   governed type, and create exactly the requested semantic artifact and
   required navigation. For an open-world addition, follow base OKF and do not
   present a local type as profile-defined. If an adjacent concept independently
   passes the
   admission test, recommend it with rationale; do not create it without the
   user's explicit authoring intent. Do not create a taxonomy for symmetry.
4. **Apply the admission test.** Include a claim only when it is accepted,
   consequential, durable through ordinary implementation change, difficult to
   infer reliably, unambiguously, and with reasonable effort from authoritative
   repository, generated, or live sources, and worth maintaining. Weigh the
   omission risk against reading, discovery, review, reconciliation, and drift
   cost. Exclude proposals, procedures, inventories, and transient
   implementation detail that fail this test. Recommend reduction or
   relocation beyond the authorized artifact; do not silently widen the edit.
5. **Write for human comprehension.** Lead with the subject's purpose,
   responsibility, boundary, and consequences. Prefer the shortest cohesive
   explanation and use a small table or diagram only when it materially makes
   relationships, hierarchy, or sequence easier to scan. Keep one
   independently addressable entity per concept document.
6. **Write only useful functional and product quality meaning.** Connect
   durable functional meaning and accepted Product Quality Requirements to
   responsibilities, authority, boundaries, dependencies, state, invariants,
   and accepted tradeoffs. Omit empty views. Never generate Product Quality
   Requirements from the ISO/IEC 25010 taxonomy, infer their acceptance from
   code or telemetry, invent targets, or create empty quality collections.
   Explain why structure exists rather than cataloging components.
7. **Route precision to its owner.** Link tests and examples for exact
   scenarios, types and schemas for contracts, code and configuration for
   current implementation, and telemetry for observed operation. Generate
   current realization views when practical. State what each link establishes;
   do not claim more evidence than it provides.
8. **Preserve the required system-context kernel.** Keep lifecycle,
   ownership, architecture decision policy, and assurance in their exact root
   concepts. A bounded authoring request may revise one of them but MUST NOT
   move its meaning into an overview or C4 system. Containers and components
   inherit this context; document only consequential exceptions. Do not use
   OKF `status` as system lifecycle or decision status, copy a volatile roster,
   represent a proposal as an ADR, or turn an internal choice into a binding
   constraint.
9. **Reconcile disagreement explicitly.** When prose and observed evidence
   differ, determine whether the implementation is wrong, the document is
   obsolete, the evidence is insufficient, or accepted intent changed. Do not
   let the newest artifact silently win. Stop when resolution requires a new
   product or architecture decision.
10. **Organize for progressive disclosure.** Preserve profile-permitted local
    choices unless the caller authorizes a bounded reorganization. Keep
    `index.md` navigational and give every concept a stable named file from first
    admission. The first use case, for example, creates
    `use-cases/index.md` and `use-cases/<named-use-case>.md`, never
    `use-cases.md`. Keep the required `decisions.md` policy while adding the
    adjacent `decisions/` collection only with the first accepted ADR. Add
    `constraints/` only with the first admitted constraint and never create
    `constraints.md`. Omit all empty conditional collections. A same-named
    directory may elaborate one cohesive concept but must not conceal several
    peer entities.
    Keep C4 components beneath their owning container; model shared code as
    modules unless it has a runtime boundary.
11. **Make and verify the authorized change.** For authoring, edit the bounded
    documentation and required navigation while preserving unrelated work. For
    review-only requests, return findings without edits. Reapply the admission
    test, verify claims and links against their authorities, give time-sensitive
    strategic hypotheses a review boundary, establish separate OKF v0.2 and
    profile results, and inspect the diff for copied mechanics or collateral
    changes. When authoring is stopped on a setup or migration precondition,
    verify that the legacy material and its evidence were not modified and
    report the unchanged scope. Treat unavailable or insufficient validation
    evidence as `unknown`; never claim the resulting document or corpus conforms
    on that basis.
12. **Handoff.** State the subject and accepted meaning preserved, evidence
    checked, files changed or reviewed, and any unresolved decision, evidence
    gap, or reconciliation owner. For each recommended addition, reduction, or
    reorganization outside scope, state the evidence, risk addressed,
    maintenance cost, smallest safe change, and authority needed.

Do not change source code, configuration, runtime systems, proposals, or
external records unless the caller separately requests that work. A finished
document is concise enough to maintain, explicit enough to guide change, and
honest about the authorities that own its exact and current facts.
