---
name: setup-architecture-docs
description: Plans or establishes the smallest discoverable, OKF v0.2 and software-architecture-docs profile-conforming architecture-documentation adoption with the required lifecycle, ownership, decision-policy, and assurance kernel for one or more repository systems. Use when asked to set up, adopt, initialize, migrate, plan, or connect architecture docs or Just Enough Architecture Docs. Not for choosing an architecture, inventing missing system context, assessing or repairing an established conforming corpus, or maintaining existing architecture docs.
---

# Set up architecture docs

Plan or establish an explicit, discoverable, and maintainable repository-local
adoption of Just Enough Architecture Docs without inventing architecture
meaning or generating a documentation taxonomy.

Setup succeeds when a future contributor or agent can discover which system or
bounded authority each corpus describes, reach its one canonical root, find the
required lifecycle, ownership, decision-policy, and assurance concepts plus any
admitted optional subjects, distinguish gaps and proposals from accepted
meaning, and select the appropriate authoring or maintenance workflow. Every
established corpus must also conform to OKF v0.2
and the `software-architecture-docs` application profile. Files are evidence of
that outcome, not the outcome by themselves.

This skill is a non-standalone member of the software-architecture pack. From
the active AXM scope root, begin with
`.axm/extensions/@craigsmitham/knowledge/software-architecture/src/guides/organizing-an-architecture-docs-corpus.md`.
Always open
`architecture-documentation/software-architecture-application-profile.md`
because it defines the required adoption and conformance contract.
Open `architecture-documentation/just-enough-architecture-docs.md` when the
adoption boundary, authority model, or admission test needs explanation.

## Authority and modes

Use this skill only for an explicit request to plan, set up, adopt, initialize,
or connect architecture documentation. A setup or adoption request authorizes
bounded changes to the selected architecture roots and the canonical persistent
repository instructions. A request to assess, plan, preview, or recommend is
read-only. Do not add a review gate when the request, evidence, and safe defaults
already establish the result.

In read-only mode, use only local, credential-free inspection mechanisms whose
provenance and non-mutating behavior are established. Do not execute
repository-controlled scripts, install dependencies, create caches or generated
artifacts, access external systems, or invoke a check whose effects are unknown.
Skip any otherwise applicable check that cannot be established as read-only and
report the resulting verification limitation. A mutating setup request does not
implicitly authorize network access, credentials, dependency installation, or
effects outside the selected architecture roots and persistent instruction
authority; obtain separate authority for those effects.

If an established setup needs broken-link repair, freshness review,
reconciliation, cleanup, or pruning, classify it as established maintenance and
leave that work to `reconcile-architecture-docs`. Separate any genuinely missing
adoption choice from the maintenance scope. Substantive accepted meaning belongs
to `author-architecture-docs` even when setup exposes its absence.

## Build the adoption brief

Inspect proportionately before choosing a playbook. Read repository
instructions and the existing architecture, product, requirement, decision,
guide, and proposal material. Inspect enough code, tests, schemas,
configuration, deployment boundaries, and workspace structure to identify
plausible systems and the authorities that already own exact facts. Repository
structure and implementation evidence may identify candidates; they do not by
themselves accept a system boundary, desired-state claim, owner, or format.

Build one working adoption brief with these fields:

- each documented system or bounded authority and its canonical corpus root;
- existing accepted architecture subjects, proposals, and evidence routes;
- the canonical persistent repository instruction authority;
- required OKF v0.2 and `software-architecture-docs` profile version and
  current conformance state;
- system lifecycle, support-state, and change-horizon authority;
- maintenance responsibility, stewardship boundary, and continuity or
  escalation routes;
- architecture decision policy, including its record threshold, acceptance
  authority, location, minimum content, and reconsideration triggers;
- assurance obligations, evidence authorities, required review or approval,
  and reassessment triggers;
- profile-permitted local choices and documentation review triggers; and
- requested mode, expected effects, and repository-state playbook.

Classify each field as **established**, **safely defaultable**, **materially
ambiguous**, **missing but non-blocking**, or **missing and blocking**. Keep the
brief as working state unless the user requested a durable assessment. Persist
only the accepted local choices and useful gaps that belong in the repository.

For a substantial run, open with the understood scope, whether the run is
read-only or mutating, the expected adoption surfaces, and the next possible
decision point. Report progress at repository-state and decision boundaries,
not as a transcript of file inspection.

## Select the playbook

Choose from the repository state and requested mode rather than forcing every
repository through one creation sequence.

| Playbook                 | Use when                                                                                                         | Result                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Bootstrap**            | One system boundary is clear and no architecture corpus exists                                                   | Create the smallest useful root and instruction route                                                     |
| **Connect**              | Useful accepted material exists but no coherent setup or canonical root connects it                              | Establish one canonical root and link the material in place                                               |
| **Federate**             | Repository authority already defines more than one system-to-root mapping                                        | Connect each system to exactly one corpus and expose the mappings without inventing a platform corpus     |
| **Migrate**              | A coherent architecture corpus exists but lacks required OKF or profile adoption or violates the adopted profile | Preserve its authority, establish the required contract, and perform only authorized mechanical migration |
| **Recommend**            | The request is read-only or a material adoption choice remains unresolved                                        | Return the adoption brief, smallest viable setup, effects, and unresolved decisions without mutation      |
| **Defer to maintenance** | A coherent setup already exists but is damaged, stale, duplicated, or contradictory                              | Preserve it and route the bounded maintenance work                                                        |

Do not treat scattered files as an established corpus merely because they use
architecture vocabulary. Do not treat several roots as federation unless an
accepted authority maps each root to a distinct documented system.

## Resolve choices proportionately

Preserve an established coherent root, profile-permitted organization, and
instruction route. For one system with no stronger root convention,
`docs/architecture/` is the safe default. OKF v0.2 and the installed
`software-architecture-docs` profile are required rather than repository
choices. The standard event-driven review triggers in this workflow are also
safe defaults. Do not create a competing repository-specific format, profile,
instruction authority, or multi-system layout merely for symmetry or
automation.

Missing accepted lifecycle, ownership, decision-policy, or assurance meaning
does not authorize invention. It is non-blocking for a read-only recommendation
or truthful migration assessment, but it blocks a claim that setup produced a
profile-conforming corpus. Use accepted stable authorities when available;
otherwise present the missing semantic decision or route it for bounded
authoring. Do not infer it from usernames, commit history, directory ownership,
a volatile roster, current implementation, or the newest artifact.

Stop before dependent writes when materially different results remain
plausible, including:

- platform-wide versus per-product or per-system corpora;
- competing canonical roots;
- conflicting persistent instruction authorities; or
- a profile migration that would change concept identity, classification, or
  accepted semantic ownership without explicit authority.

Present a material decision in this order: the decision and proposed status;
governing evidence, criteria, and constraints; every viable option in parallel
form; material exclusions; one recommendation after the comparison when the
evidence supports it; and a final request to choose, revise, defer, or seek more
evidence. Use stable descriptive option names. The ordinary text presentation
is authoritative; a host affordance may render the same choices only when its
labels map unambiguously. Reuse the exact option names in **Choose** and any
follow-up decision so every response has a stable referent. After emitting a
decision gate, wait for the answer.

Use these literal section labels and order for the decision presentation:

1. **Decision** and **Status**
2. **Evidence and criteria**
3. **Options**, with the same consequence fields and comparable detail for
   every viable option
4. **Material exclusions**
5. **Recommendation**, or `None — more evidence is required`
6. **Choose**, explicitly permitting selection, revision, deferral, or a
   request for more evidence

Do not label an option as recommended, give it greater emphasis, or otherwise
reveal the recommendation inside **Options**. Complete the neutral comparison
before emitting the single **Recommendation** section.

## Apply the selected playbook

For **Bootstrap**, create the canonical root `index.md`, the required
`lifecycle.md`, `ownership.md`, `decisions.md`, and `assurance.md` concepts, and
the concise instruction discovery route. Populate every required concept only
from accepted meaning or a bounded, justified absence. If any required meaning
is unavailable, use **Recommend** or stop at the applicable decision gate; do
not create placeholders or claim conforming adoption. Do not create an
overview or conditional collection until accepted content passes the admission
test.

For **Connect**, preserve useful existing files and local organization. Create
or populate the four required root concepts only by transferring accepted
meaning from its current authority, then link other accepted material from the
canonical root without moving, renaming, or rewriting it merely for cosmetic
consistency. Treat material as an admitted profile concept only when repository
authority establishes that status and its representation conforms; otherwise
preserve it as linked migration input or an external authority. Preserve
proposals, delivery records, and observed evidence in their own lifecycles. A
profile violation is nonconformance, not a local format deviation.

For **Federate**, use only an accepted system-to-root mapping. Give each system
one canonical corpus root and its own minimal adoption surface. Add one concise
repository instruction route that exposes every mapping and the shared method.
Do not create a platform corpus, cross-system desired-state claim, or common
taxonomy unless separately accepted and authorized.

For **Migrate**, preserve the established system boundary, corpus root,
accepted meaning, and external authority routes. Add the required OKF and
profile declaration, then repair only unambiguous metadata, navigation, and
profile placement within the authorized setup surface. Establish the four
required root concepts only from accepted authority. Stop before any path,
classification, split, merger, semantic-ownership transfer, ADR conversion, or
constraint conversion unless the user explicitly authorized that migration
class and scope. Until both conformance results pass, describe the material as
a corpus requiring migration rather than a valid alternative adoption.

For **Recommend**, make no changes. Return the evidence-status adoption brief,
the smallest viable file effects, safe defaults, non-blocking gaps, and every
decision that must precede mutation. State explicitly that the repository is
unchanged.

For **Defer to maintenance**, do not recreate, duplicate, or substantively
rewrite the established corpus. Report the existing setup and route broken
navigation, stale claims, contradictions, consolidation, or pruning to the
maintenance workflow.

## Write the minimum adoption surface

Create or revise each selected root `index.md` so it:

- declares `okf_version: "0.2"` in root frontmatter;
- names the documented system or bounded authority;
- explicitly adopts and links the installed `software-architecture-docs`
  profile identity and version as the representation of Just Enough
  Architecture Docs, and records the canonical local root;
- records any profile-permitted local choices without presenting a profile
  violation as a deviation or waiver;
- links every existing admitted architecture subject and states what each
  external authority route establishes;
- links the required `lifecycle.md`, `ownership.md`, `decisions.md`, and
  `assurance.md` concepts; and
- requires review when accepted behavior, responsibility, boundary, Product
  Quality Requirement, architecture consequence, or an evidence route changes.

Keep the root navigational; do not place substantive architecture entities in
it or use `overview.md` as a catch-all. Create each required root singleton;
do not create conditional collection directories without accepted content
that passes the admission test. When a first accepted optional concept
already exists, preserve or recommend its stable canonical named file and add
only the collection navigation it needs. Never create a plural catch-all such
as `use-cases.md` for later splitting. Setup must not generate ISO/IEC 25010
characteristic directories, Product Quality Requirements, a Product Quality
View, or any other apparently complete taxonomy.

Add or update one concise route in the canonical persistent repository
instructions. Map each documented system to its root and route contributors to
the software-architecture pack. Preserve unrelated instructions and update an
existing route in place. Do not copy the shared method, templates, or folder
tree into repository instructions, and do not create competing host-specific
instruction authorities.

## Verify the outcome

Verify the requested mode and contributor capabilities, not only file
existence:

- every documented system maps to exactly one canonical root and every root
  resolves;
- the persistent instruction route lets a contributor discover each mapping
  and the shared method;
- every existing admitted subject is reachable and proposals remain outside
  accepted architecture;
- the four required root concepts exist at their exact paths, are linked from
  the root, and satisfy their semantic contracts from accepted authority;
- a justified no-ADR policy has no empty `decisions/` collection, every local
  ADR is a named accepted record under `decisions/`, every admitted constraint
  is a named concept under `constraints/`, and `constraints.md` is absent;
- no empty taxonomy, speculative overview, copied volatile inventory, inferred
  desired state, or competing setup was created;
- the root explicitly adopts the installed profile version and every admitted
  concept conforms to its applicable structural and semantic rules;
- OKF v0.2 and profile conformance are checked and reported separately, with
  unavailable or insufficient evidence preserved as `unknown` rather than
  pass; and
- a read-only run made no changes.

Before running a documentation, link, profile, or repository check, establish
its command provenance, required authority, and side effects. In read-only mode,
record the observable repository state before inspection, run only established
non-mutating checks, and compare the state afterward. Use host- or
adapter-observed artifact, filesystem, tool-call, and external-state evidence
when available; a narrative claim that nothing changed is not evidence. When an
observation channel is unavailable, report the limitation and do not claim more
than the retained evidence establishes.

The pack-owned structural profile checker is
`.axm/extensions/@craigsmitham/knowledge/software-architecture/scripts/validate-software-architecture-profile.py`.
Run it only after establishing its installed identity, dependency availability,
and non-mutating behavior. It does not replace the separate base OKF result or
the named manual semantic review required by the profile.

In mutating mode, run only checks whose effects fit the authorized paths and
compare the resulting state with the intended adoption surface. Inspect the
diff for unrelated edits and silent semantic decisions. If a check is unsafe
for the requested mode, unavailable, or fails after a bounded attempt, preserve
the current state, report the check and limitation or failure, and do not claim
the affected outcome is verified.

## Handoff

Lead with the achieved or proposed repository state. Then report, in this
order:

1. each documented system, canonical root, required OKF and profile versions,
   and instruction route;
2. existing material preserved or connected and the authority it retains;
3. profile-permitted local choices, safe defaults, and unresolved semantic or
   migration gaps;
4. files or effects changed, including an explicit no-change statement for a
   read-only or blocked run;
5. verification performed and any limitation; and
6. the next bounded authoring, maintenance, migration, or decision workflow.

Describe what is now true and what remains unresolved rather than leading with
a raw file list. Present possible semantic additions, reductions, migrations,
or reorganizations as recommendations unless the user explicitly authorized
that class and scope of change.

End every completed, proposed, or blocked handoff with one explicit
`Next workflow:` line. Name `author-architecture-docs`,
`reconcile-architecture-docs`, a required adoption decision, a separately
authorized migration, or `None` with the condition that would make another
workflow necessary.

Do not choose an architecture, create substantive desired-state claims from
implementation inference, configure unrelated tools, or modify source code,
runtime systems, proposals, and external records. Setup is complete only when
the requested adoption state is discoverable, authority-aware, proportionate,
and verified as conforming to both OKF v0.2 and the installed
`software-architecture-docs` profile. A completed read-only assessment may
instead establish that setup or migration remains required.
