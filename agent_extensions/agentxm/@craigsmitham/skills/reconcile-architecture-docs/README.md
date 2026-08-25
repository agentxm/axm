# Reconcile architecture docs

Assesses and reconciles an established set of software architecture docs
through evidence-aware repair, pruning, consolidation, lifecycle decisions,
and separate OKF v0.2 and software-architecture-docs profile checks.

Use it when architecture docs may be stale, broken, duplicated, contradictory,
or more costly than useful. Review requests remain read-only; explicit
reconciliation or maintenance requests authorize bounded mechanical and
unambiguous repairs.
Semantic additions, removals, mergers, reclassification, and lifecycle or
authority changes require explicit user authorization for that class and scope;
otherwise the skill reports a risk-grounded recommendation. Do not use it for
initial setup, a known new architecture subject, choosing an architecture, or
generic documentation cleanup.

The workflow may classify unresolved conformance failures without changing
files, but it never treats a local profile waiver as valid or calls a corpus
conforming while required evidence fails or remains unknown.

This skill is a non-standalone member of the Gen Stack pack because
it loads that pack's software-architecture knowledge.

## Revision 0.5.0

- Assesses the required System, lifecycle, ownership, decision-policy, and assurance
  concepts as distinct root authorities.
- Reconciles decision policy, accepted ADRs, and subject-colocated Requirements
  without treating proposals or implementation as accepted desired state.
- Detects accepted invariants, guarantees, prohibitions, boundary rules, and
  required outcomes embedded outside Requirements; authorized migrations move
  their normative statement without erasing architectural context.
- Distinguishes implementation non-satisfaction, stale or faulty evaluations,
  Requirement defects, insufficient evidence, changed conditions, and changed
  intent while preserving useful repeated evaluation predicates.
- Classifies extraction from catch-alls and profile `0.9.0` migration as
  semantic work that requires explicit authority.

This is a breaking change from `0.3.0`. Existing profile `0.9.0` corpora require
an authorized semantic migration to profile `0.10.0`; rollback is to `0.3.0`.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

## Example

> Reconcile the reservation platform architecture docs after the storage
> refactor. Repair objective link and navigation problems, but surface any
> desired-state disagreement instead of assuming the code is authoritative.

## License

MIT. The software-architecture knowledge bundle retains its separately declared
license.
