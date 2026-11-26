---
name: refresh
description: Refresh a codebase or specified scope to remain supportable as dependencies, platforms, toolchains, and external contracts evolve.
disable-model-invocation: true
---

Keep the requested scope supportable as its environment changes. Complete
justified upgrades and migrations involving dependencies, runtimes, platforms,
toolchains, or external contracts while preserving applicable obligations.

For opportunity questions, assess candidates and their tradeoffs without
implementing them. For change requests, carry the requested outcome through
implementation and verification within the authorized scope.

Establish the current configuration, affected consumers, supported uses,
and the reason for change. Use authoritative information for the relevant
versions and support lifecycle. Newness alone is not a benefit. Consider
removing an unnecessary dependency before investing in its upgrade, and
include adoption, migration, security, provenance, licensing, operating, and
ongoing ownership constraints relevant to the proposed change.

Reason about the compatible dependency network, including transitive
requirements, build and deployment environments, and data or protocol
contracts. Select a coherent target and bounded migration increments.
Distinguish required behavior changes from incidental restructuring. Where
state or external consumers are affected, establish the transition order,
compatibility window, and feasible recovery or forward-repair approach;
a source rollback may not reverse a data migration.

Verify the target against the contracts and environments that matter, with
evidence proportionate to risk and a relevant starting baseline. A successful
install or compile alone does not establish compatibility. Reconcile manifests,
lockfiles, configuration, tests, documentation, and operational instructions
with the selected target.

Complete consumer migration before removing old paths. Remove temporary
adapters, flags, and superseded machinery when their obligations end. If a
transition must remain open, identify its owner, remaining consumers, and
exit condition; do not report it as finished.

Report the supported result, verification, material costs and tradeoffs,
and unresolved uncertainty. Respect the requested scope of local changes,
deployment, and retirement. Retaining the current configuration is a valid
outcome when no worthwhile refresh is justified.
