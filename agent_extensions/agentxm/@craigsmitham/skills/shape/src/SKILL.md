---
name: shape
description: Shapes raw or mixed change context into a rough, bounded, repository-grounded Pitch with problem or opportunity, intended outcome, appetite, boundaries, anticipated Gen Stack impact, an inline filesystem breadboard, response contours, risks, authority, and a precise requested response. Use before spec or design when change intent needs framing or elicitation. Not for accepting Requirements or Architecture, prescribing implementation-level Evaluations or tests, selecting Design, planning, implementing, prioritizing, or authorizing change.
---

# Shape

Turn one raw or mixed change Signal into a Pitch that can be discussed,
refined, or answered by specification, design, research, investigation, or the
applicable human authority.

This skill belongs to the Gen Stack pack. Probe these exact workspace-relative
paths first and read them when present:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
- `knowledge/gen-stack/src/processes/deciding-and-realizing-software-changes.md`;
  and
- `knowledge/gen-stack/src/control-loop/shaping-a-pitch.md`.

If those exact paths are absent, resolve the installed
`@craigsmitham/knowledge/gen-stack` pack sibling through active AXM scope; do
not assume an `.axm` filesystem layout or search for alternate copies. Read
narrower linked Gen Stack guidance only when the candidate impact
materially implicates it. Repository-local accepted sources own system meaning.

## Boundary

Shape owns the provisional Pitch and its coherence. The Pitch is a rough,
bounded, evidence-linked articulation of the change worth defining; it is not
accepted Intent, a Requirement, Architecture, Change, Change Specification,
Change Design, a Work item, a plan, priority, estimate, implementation commitment, or
authorization.

`spec` determines formal desired-state changes. `design`
compares and selects the proportional technical response. Shape may identify
anticipated effects and rough response contours so those stages have an
answerable starting point, but it must not pre-decide their outcomes.

Shape is explicitly agnostic about implementation-level Evaluations and tests.
It may identify anticipated Requirement-satisfaction and
Architecture-realization Protocol claims, lifecycle effects, semantic coverage
conditions, and evidence gaps. It must not propose test types, files, suites,
fixtures, harnesses, frameworks, commands, code-coverage targets, or
Implementation-conformance Evaluations.

## Select the behavior

Choose the lightest behavior that remains truthful:

- **Immediate Pitch:** enough context and repository evidence establish the
  problem, outcome, boundary, and affected neighborhood with manageable risk.
- **Provisional Pitch plus elicitation:** a useful frame is possible and only a
  few material facts could change it. Mark assumptions and ask the smallest
  discriminating questions after the draft.
- **Elicit or discover first:** ambiguity, disagreement, consequence,
  irreversibility, authority, or missing evidence makes an early frame unsafe
  or likely to anchor the wrong change.
- **Route or terminate:** use research for an external or distributed evidence
  question, investigate for a concrete observed discrepancy, a human decision
  for contested meaning or appetite, or dispose the request as blocked,
  deferred, or no change.

Scale elicitation with consequence and uncertainty, not with a fixed
questionnaire. Do not ask the user for facts that safe repository inspection
can establish. Ask only questions whose answers could materially alter the
Pitch, its disposition, or its next route.

## Shape

1. Bind the source records, evidence, proposal, current maturity, decision
   authority, and available action authority.
2. Separate the consequential problem or opportunity from any supplied
   mechanism or implementation preference.
3. State the observable intended outcome, affected audience, and why it
   matters.
4. Set appetite, boundaries, invariants, exclusions, no-gos, and stopping
   conditions. Appetite is a proportionality constraint, not an estimate or
   promise.
5. Inspect the smallest sufficient repository and accepted corpus neighborhood.
   Orient anticipated impact across System and governance, Intent,
   Requirements, Architecture, Evaluations, Implementation, operations,
   Process, and Provenance.
6. Place a bounded filesystem breadboard immediately after the Impact summary,
   with no separate breadboard heading. Show current topology and candidate
   impact using exact repository-relative paths, existing IDs, and material
   established relationships.
7. Sketch rough response responsibilities, interactions, or seams without
   selecting detailed Design or prescribing an implementation plan.
8. Expose risks, unknowns, rabbit holes, authority gaps, and the precise
   downstream question.

For the breadboard use `[=]` for relevant unchanged elements, `[P]` for
provisional semantic impact, `[~]` for likely realization, representation, or
evidence impact, `[+?]` for a possible new unresolved element, and `[!]` for a
material uncertainty or conflict. Candidate nodes and relationships must stay
visibly provisional. Never invent a path, identifier, relationship, or absent
corpus. If filesystem access is unavailable, say so in the breadboard and name
the inspection still needed.

Existing tests and Evaluation realization artifacts may be consulted as
evidence or Provenance, but never project them as `[P]`, `[~]`, or `[+?]`
changes in the breadboard. Product Implementation Units may still appear when
they ground the affected realization neighborhood.

## Output

Follow the complete Pitch presentation contract in `Shaping a Pitch`. Its
top-level headings, in order, are:

1. `# Pitch: <title>`
2. `## Problem or opportunity`
3. `## Intended outcome`
4. `## Appetite`
5. `## Boundaries and no-gos`
6. `## Impact`
7. `## Rough response contours`
8. `## Risks and rabbit holes`
9. `## Authority and maturity`
10. `## Requested response`
11. `**Disposition:** Draft | Ready for response | Blocked | Deferred | No change`

Under Impact, begin with a summary and the headingless filesystem breadboard,
then include only applicable semantic subsections from the Guide. Do not emit a
ritual empty inventory.

When `### Evaluations` applies, limit it to anticipated
Requirement-satisfaction and Architecture-realization Protocol meaning and
semantic coverage or evidence gaps. Leave all executable and
Implementation-conformance choices to `design` or later stages.

A Pitch is **Ready for response** only when the problem or opportunity,
outcome, appetite or explicit appetite gap, boundaries, grounded impact,
material unknowns, authority, and requested response are sufficient for the
named next stage. Use **Draft** for productive refinement, **Blocked** for a
named missing prerequisite, **Deferred** with a reason and reopening condition,
or **No change** when the evidence supports stopping.

When a material human decision remains, present stable Option A, Option B, and
only if useful Option C; compare the relevant tradeoffs, label a recommendation
and its uncertainty, and ask the applicable authority to decide. Do not infer
acceptance from silence or Pitch polish.

## Done

Stop when the Pitch has a truthful disposition and either an exact requested
response or a supported termination. Route a combined specification-and-design
request to `quick-change`; otherwise route to `spec` or `design` as requested.
Do not continue into those activities, planning, implementation, repository
mutation, or external action unless separately invoked and authorized.
