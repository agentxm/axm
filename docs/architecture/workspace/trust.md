---
status: stable
description: The authority, limits, and lifecycle of AXM workspace trust state.
depends-on:
  - ./overview.md
---

# Trust

Workspace trust and provenance record which external source and resolution AXM
accepted when it acquired extension content. They separate that accepted
baseline from desired state, receipt history, current content, ownership, and
later local byte changes.

[Sources and resolution](sources.md) defines where AXM may look and which
results are eligible. Resolution selects an eligible result; trust records the
source identity and resolution evidence AXM accepted. Source configuration,
receipt history, and resolution policy cannot substitute for that evidence.

## Responsibilities

Trust state records the external identity and accepted resolution evidence
needed to recognize, verify, and, where supported, reacquire external content.
That may include an exact version or immutable revision, publisher identity,
integrity, and content identity when those facts are required by the source.

An accepted resolution remains stable while it satisfies desired constraints.
Update may advance it; sync or reinstall may use it to reacquire missing content
without consulting receipt history.

A trust change participates in the same workspace change as the settings,
canonical extension content, and managed outputs that depend on it. Receipt
history is written only after that business work succeeds.

## Non-responsibilities

Trust does not:

- express which extensions the workspace wants;
- express a user's version constraint or choose when to advance a resolution;
- establish ownership of an arbitrary existing path;
- make a receipt row or installed extension reachable;
- prove that canonical content or a managed output is currently present;
- record command history or operation timing;
- treat later local byte drift as a standing security violation; or
- authorize AXM to overwrite workspace-authored or unowned content.

A release-age exemption relaxes only that selection policy. It does not bypass
source identity, integrity, ownership, or trust requirements.

Settings and authored manifests own durable choices. Trust owns the accepted
source and resolution baseline. The observed filesystem owns whether content is
present or divergent. Receipt history records completed work. Copying or
editing source details in another artifact does not establish trust.

## Acquisition and authority changes

AXM establishes trust as part of an explicit operation that resolves and
acquires verified external content. Changing an extension among
workspace-authored, external, and bundled authority also requires an explicit
operation; receipt history or a path that resembles managed content is
insufficient.

External installed content remains AXM-managed when its local bytes drift, but
ordinary sync preserves that drift. An explicit update or reinstall may
replace it and must disclose that replacement.

Trust state is AXM-managed workspace state rather than a user-authored source of
intent. Invalid or missing trust is diagnosed and recovered only from
authoritative configuration and verified source evidence. AXM does not infer
acceptance from receipt history or from the installed bytes it is trying to
evaluate.

## Testing strategy

Behavior tests prove that acquisition records the accepted source and
resolution, a satisfying accepted resolution remains stable, update alone
advances it, exact reacquisition does not use receipts, copied or edited receipt
data cannot establish trust, local byte drift does not revoke trust, authority
changes require explicit intent, and handled failure leaves trust consistent
with the other affected business state.
