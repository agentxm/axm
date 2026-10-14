# Audit workflow

Use for the `audit` and `verify` tasks and for the assessment passes of
`remediate`. Read the `evaluation/context-evaluation` concept from the
agent-engineering bundle when the requested scope requires evidence about
selection, use, or economy.

The audit may inspect files, repository state, harness documentation, and
read-only effective-context diagnostics. It does not edit, synchronize, install,
publish, invent policy, or remove content.

## Steps

1. **Bind the audit.** Record the repository and revision, target scopes,
   supported hosts, canonical sources, projections, task, exclusions, audit
   time, and exact knowledge or guide revision.
2. **Resolve the harness contract.** Establish which instruction sources are
   recognized, their intended scope and runtime applicability, how they compose,
   how conflicts resolve, and how the effective set can be inspected. Mark
   unknown behavior as unknown instead of assuming ancestry or precedence.
3. **Map authority.** Distinguish canonical sources from aliases, imports,
   symlinks, copies, generated regions, and host projections. Identify drift or
   conflicting ownership without repairing it. When AXM owns the surface,
   inspect its current instruction inventory instead of inferring ownership from
   filenames or banner prose.
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
   adherence alone. Apply the guide's outcome-first criterion to distinguish
   unnecessary procedure from mechanisms or ordering that protect required
   constraints; assess the outcome and retained constraints, not adherence to
   one preferred sequence.
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
9. **Hand off remediation.** In the `remediate` task only, freeze the pre-change
   identities and report, then run `references/author-workflow.md` against the
   accepted findings. Do not silently create a destination guide or policy that
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
