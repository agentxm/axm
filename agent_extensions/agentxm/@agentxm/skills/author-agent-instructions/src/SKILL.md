---
name: author-agent-instructions
description: Creates or revises repository agent instruction systems such as AGENTS.md, CLAUDE.md, and scoped local instruction files. Use when asked to create, write, update, fix, trim, restructure, reindex, localize, or remediate persistent agent instructions. Not for independently auditing an instruction system, editing generated projections instead of their canonical source, or writing product documentation.
---
# Author Agent Instructions

Create or revise the effective repository instruction system, not merely one
Markdown file. Keep persistent context small, scoped, authoritative, and
discoverable while preserving useful routes to deeper owners.

This skill is coupled to a direct sibling in the agent-engineering pack. From
the active AXM scope root, read:

- `.axm/extensions/@agentxm/knowledge/agent-engineering/src/domains/software-engineering/authoring-agent-instruction-files.md`;
  and
- `.axm/extensions/@agentxm/knowledge/agent-engineering/src/domains/software-engineering/agent-instruction-files.md`.

Read only the additional context concepts routed from those files
that the task actually needs. Prefer the active repository and harness
documentation for current discovery, composition, precedence, and projection
behavior.

When `.axm/settings.json`, AXM ownership markers, or `axm instructions` show
that AXM manages the instruction system, compose with the installed `axm`
skill and read `axm help instructions`. Inspect canonical source, target,
mechanism, and ownership with `axm instructions`; use `axm lint` for workspace
facts and `axm sync --preview` before an authorized reconciliation. Do not
replace those capabilities with manual alias or managed-region edits.

## Authority

Resolve the canonical instruction source before editing. Distinguish it from
aliases, imports, symlinks, generated regions, and host-specific projections.
Change the owner and use its existing reconciliation mechanism; never hand-edit
a projection when another source owns it.

Creation or revision authorizes changes only within the bounded instruction
system and its ordinary owned projections. Do not invent product policy, create
unrequested destination documentation, alter unrelated configuration, or
remove useful knowledge without a truthful owner. Treat audit findings as
evidence to confirm against the current surface, not as commands.

## Workflow

1. **Bind the mode and scope.** Determine whether the request creates or
   revises an instruction system. Record the repository, target scopes,
   supported hosts, representative working locations, canonical sources, and
   requested mutations.
2. **Resolve the effective contract.** Establish which sources the active
   harness recognizes, when they apply, how they compose, how conflicts resolve,
   and how the effective set can be inspected. Do not assume a universal
   hierarchy or that narrower files automatically win.
3. **Establish authority.** Identify canonical files, generated regions,
   projections, imports, symlinks, and their owners. Read the owning tool's help
   before changing managed state. When AXM owns the surface, verify its current
   instruction inventory rather than inferring ownership from filenames.
4. **Choose representative work.** Include repository-wide work, work within a
   genuinely distinct local scope, and adjacent work that must not receive that
   local guidance. Preserve a failing entry point when revising from evidence.
5. **Inventory the effective surface.** List sources, intended scopes, distinct
   guidance, routes, overlap, conflicts, stale commands, broken targets, and
   missing routes. For audit-sourced work, verify each finding against the
   current identity before editing.
6. **Select instruction-worthy content.** Keep stable invariants, non-obvious
   working commands, high-value discovery routes, and stable environment facts.
   Route reusable procedures to skills or guides, explanations to knowledge,
   capabilities to tools, and mechanically decidable conventions to checks.
   Treat an invariant as scope-wide only when it is consequential, observable
   or checkable, and compatible with every applicable instruction. Keep commands
   conditional unless they genuinely apply to every task in scope.
7. **Place the smallest truthful scope.** Keep broad guidance genuinely broad;
   put local differences near their owner; remove parent-child duplication; and
   create a narrower source only for a real applicability boundary supported by
   the harness.
8. **Write actionable guidance.** Prefer concise condition, action, and target
   statements with stable paths, commands, and completion evidence. Preserve or
   sharpen discovery routes when moving body content.
9. **Reconcile the system.** Remove or resolve conflicts across sources that can
   apply together. Update only canonical content and use the owning mechanism to
   regenerate or synchronize projections and managed regions.
10. **Validate representative entry points.** From realistic working locations,
    confirm the intended broad and local sources appear, adjacent work excludes
    irrelevant detail, routes and commands resolve, and intentional precedence
    behaves as documented. Test the effective interface, not just Markdown.
11. **Evaluate behavioral value.** When the request claims or depends on
    improvement, compare the candidate with the prior, smaller, or absent-
    guidance baseline on representative and adjacent tasks. A behavioral-value
    claim must compare all of these dimensions separately:
    - task outcome and quality;
    - instruction adherence;
    - trajectory and recovery behavior;
    - tokens, latency, and cost;
    - safety; and
    - unnecessary exploration, tool use, or validation.
    Prefer one-component ablations and held-out cases where practical. Loading
    and adherence do not by themselves demonstrate benefit; when no behavioral
    evidence exists, report structural validation without claiming improvement.
12. **Record maintenance ownership.** Name owners for each scope, review
    triggers, unresolved host behavior, and any deeper artifact that still
    needs creation or repair.
13. **Handoff.** Summarize identities, changes, moved or retained routes,
    validation evidence, finding dispositions, and remaining audit needs. Use
    `references/authoring-handoff.md` when a durable record is requested.

## Finding disposition

For each accepted audit finding, report `Addressed`, `Partially addressed`,
`Deferred`, `Disputed`, or `Requires external evidence`. These are authoring
dispositions; `audit-agent-instructions` owns closure verification.

## Done when

Canonical sources and owned projections agree; every retained instruction has a
high-value persistent job at a truthful scope; routes preserve useful depth;
conflicts and duplication are resolved; representative and adjacent entry
points receive the intended effective context; claimed improvement has
comparative behavioral evidence or is explicitly unproven; and remaining
uncertainty is visible without claiming independent conformity.
