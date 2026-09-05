---
type: Decision
status: stable
description: The accepted decision that project workspace construction fails before operation execution when either present settings source is invalid.
depends-on:
  - ../workspace/settings.md
  - ../workspace/invariants.md
---

# Project workspace settings validity prerequisite

## Context and forces

A project workspace combines project settings with a bounded set of fallback
values and policies from user settings. Workspace construction reads and
validates both sources before resolving layouts or providing workspace
services to a command. That creates an intentional machine-wide consequence:
one invalid user settings file prevents project-workspace-backed operations in
every project on that machine until the file is corrected.

The design must balance deterministic workspace meaning, strict validation,
scope-local desired intent, closure-local failure isolation, and operational
availability. Missing settings already have explicit default semantics; an
invalid present file has user-authored meaning that AXM cannot safely replace
with defaults.

## Accepted choice

Project workspace construction has two shared settings prerequisites: project
settings and user settings. Both sources load under their existing missing-file
semantics, and every present source must be readable, valid JSON, and valid
against the current settings schema before any project-workspace-backed
operation begins.

Failure of either prerequisite ends the invocation before workspace services
are provided to the selected operation. The diagnostic identifies the owning
file and fault and directs the actor to correct or restore that file. AXM does
not continue in a degraded state, treat invalid settings as absent, rewrite or
migrate them, offer a repair command, or permit `--force` to bypass the gate.

After construction succeeds, existing semantic-closure isolation remains
unchanged: independent ready closures may continue when a later closure-local
fact or handled operation fails.

Accepting authority: maintainer approval through the repository pull-request
workflow. The binding outcome is owned by the executable specification
`cli/invalid-workspace-state-gates-operations` in the
[specification catalog](../../../specifications/catalog.md); this record owns
the architectural response and tradeoff.

## Rationale

Failing construction preserves one complete, schema-valid basis for every
workspace operation. It avoids hidden partial-workspace semantics and keeps
project/user intent separation intact: valid user settings can supply only the
already documented fallback values and never import user extension roots,
activation, agents, or targets into project desired state.

## Material alternatives

- **Continue with user settings unavailable.** Project operations could remain
  available, but every consumer would need explicit degraded-state semantics
  for inherited sources, authoring defaults, release policy, listings, and
  mutations. Rejected because it makes incomplete configuration a supported
  workspace state and weakens the single construction boundary.
- **Warn and treat invalid settings as absent.** This is simpler than threading
  degraded state, but silently substitutes defaults for user-authored meaning
  and makes malformed and missing files indistinguishable. Rejected.
- **Rewrite, migrate, or repair the file.** AXM could attempt recovery, with or
  without confirmation, but would need to infer intent from invalid data and
  would move recovery ownership away from direct editing. Rejected.
- **Isolate failure by semantic mutation closure.** Closure isolation is useful
  after a workspace exists, but cannot construct a complete workspace from an
  invalid prerequisite. Rejected as a substitute for construction validity.

## Consequences

Positive:

- every project-workspace-backed operation starts from both complete settings
  sources or does not start;
- invalid and missing settings retain distinct semantics;
- one centralized Layer-construction boundary governs reads, diagnostics,
  previews, plans, and mutations consistently; and
- post-construction closure isolation stays focused on operation facts rather
  than configuration availability.

Negative:

- one invalid machine-local user settings file intentionally blocks every
  project workspace and dependent local automation on that machine;
- unattended automation cannot self-recover and must wait for direct
  correction; and
- every new workspace-backed command must continue to use the shared
  construction boundary.

## Supersession and reconsideration

Reconsider this choice at public launch, when external compatibility
commitments change, when user-settings ownership or inheritance changes, or
when operational evidence shows that direct correction and the accepted blast
radius no longer fit AXM's assurance posture. Also reconsider if workspace
construction moves to a different durable boundary. A superseding decision
must explicitly reconcile the affected specifications and the detailed
workspace architecture.
