---
name: audit-agent-instructions
description: Audits repository agent instruction systems such as AGENTS.md, CLAUDE.md, and scoped local instruction files against context-engineering guidance and active harness behavior. Use when asked to audit, review, assess, check conformity, inspect scope or precedence, verify remediation, or audit and fix agent instructions. Not for silently changing instructions during an assessment-only audit or reviewing general documentation and product design.
---
# Audit Agent Instructions

Assess an exact effective instruction system against an explicit guidance
baseline and the active harness contract. Review the sources that actually
compose for representative work, not isolated Markdown files alone.

This skill is coupled to a direct sibling in the agent-engineering pack. From
the active AXM scope root, read:

- `.axm/extensions/@agentxm/knowledge/agent-engineering/src/domains/software-engineering/agent-instruction-files.md`;
  and
- `.axm/extensions/@agentxm/knowledge/agent-engineering/src/domains/software-engineering/authoring-agent-instruction-files.md`.

Read `.axm/extensions/@agentxm/knowledge/agent-engineering/src/evaluation/context-evaluation.md`
when the requested scope requires evidence about selection, use, or economy.

When `.axm/settings.json`, AXM ownership markers, or `axm instructions` show
that AXM manages the instruction system, compose with the installed `axm`
skill and read `axm help instructions`. Use `axm instructions`, `axm lint`, and
`axm sync --preview` as read-only evidence for canonical source, ownership,
target health, and proposed reconciliation. Audit-only mode never applies
`axm sync` or edits an AXM-owned alias or managed region.

## Modes and authority

- **Audit** is the default and leaves the instruction system unchanged.
- **Audit and remediate** requires explicit mutation intent. Preserve the
  pre-change audit, use the direct sibling
  `.axm/extensions/@agentxm/skills/author-agent-instructions/src/SKILL.md` to
  revise canonical sources, reconcile owned projections, and then audit the new
  identity.
- **Verify remediation** rechecks earlier findings against a supplied revised
  identity without further mutation unless remediation is also requested.

The audit may inspect files, repository state, harness documentation, and
read-only effective-context diagnostics. It does not edit, synchronize,
install, publish, invent policy, or remove content in audit-only mode. A
same-agent post-remediation pass is closure verification, not independent
approval.

## Workflow

1. **Bind the audit.** Record the repository and revision, target scopes,
   supported hosts, canonical sources, projections, audit mode, exclusions,
   audit time, and exact knowledge or guide revision.
2. **Resolve the harness contract.** Establish which instruction sources are
   recognized, their intended scope and runtime applicability, how they compose,
   how conflicts resolve, and how the effective set can be inspected. Mark
   unknown behavior as unknown instead of assuming ancestry or precedence.
3. **Map authority.** Distinguish canonical sources from aliases, imports,
   symlinks, copies, generated regions, and host projections. Identify drift or
   conflicting ownership without repairing it. When AXM owns the surface,
   inspect its current instruction inventory instead of inferring ownership
   from filenames or banner prose.
4. **Choose representative entry points.** Include broad work, work inside each
   meaningful local scope, and adjacent work that must not receive local
   guidance. Bind each case to its working location or target path.
5. **Inventory effective surfaces.** For each case, identify applicable sources
   and the combined guidance they contribute. Follow routes to their targets and
   verify commands, links, and owners where locally discoverable.
6. **Assess conformity.** Apply the guide's finding classes and also identify
   unknown harness contract, authority drift, projection drift, applicability
   mismatch, unresolved conflict, ineffective entry point, and unproven
   accretion. Require exact evidence and reject proposed cuts that would strand
   useful depth. Do not infer behavioral value or harm from length, loading, or
   adherence alone.
7. **Evaluate the interface.** Confirm broad guidance appears where intended,
   narrower guidance appears only for matching work, adjacent work excludes
   irrelevant detail, routes resolve, and documented precedence behaves as
   expected. A well-written file that is not selected correctly is a finding.
   When the audit scope includes helpfulness or effectiveness, seek a prior,
   smaller, or absent-guidance baseline across representative and held-out
   tasks, with separate outcome, adherence, trajectory, economy, safety, and
   unnecessary-work measures. Structural conformity is not demonstrated
   behavioral value.
8. **Report findings.** Use `references/audit-report.md`. Each finding names its
   class, applicable guidance, exact source and line or entry-point evidence,
   consequence, smallest responsible owner, and required remediation or
   condition. Separate absence of evidence from evidence of absence.
9. **Remediate when authorized.** Freeze the pre-change identities and report,
   confirm accepted findings against the current surface, then apply the sibling
   authoring workflow. Do not silently create a destination guide or policy that
   the repository has not authorized.
10. **Verify closure.** Bind the revised sources and effective surface, rerun
    affected entry points plus an adjacent regression, and mark each finding
    `Closed`, `Partially closed`, `Open`, `Accepted exception`, or
    `Inconclusive`. Stop when the scope conforms, external authority or host
    evidence is required, a finding is intentionally deferred, or another pass
    makes no progress.

## Disposition

- **Conformant** — material applicable guidance is satisfied across the tested
  effective surface.
- **Conformant with conditions** — bounded, explicit conditions contain the
  remaining gap.
- **Revise** — correctable content, scope, authority, projection, routing, or
  conflict defects remain.
- **Inconclusive** — the source identity, harness contract, representative
  surface, behavioral comparison required by the claim, or other material
  evidence is unavailable.

## Done when

The report binds exact sources, guide revision, harness behavior, and tested
entry points; distinguishes scope, applicability, composition, and precedence;
traces every finding to concrete evidence; protects useful discovery; preserves
pre- and post-change identities when remediation occurs; and does not mistake
structural conformity for demonstrated value or same-agent verification for
independent approval.
