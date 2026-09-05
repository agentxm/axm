---
type: Decision
status: stable
description: Uninstall distinguishes the removal target from the desired-state graph, so a pack whose own package cannot be read is retired by registration while its unverifiable content is preserved and reported.
depends-on:
  - ../extensions/packs.md
  - ../commands/index.md
  - ./executable-specifications-authority.md
---

# Pack retirement when the package cannot be read

## Decision

Pack uninstall partitions the desired-state graph's problems by the pack they
belong to, rather than blocking on the graph's overall verdict.

Uninstall proceeds when every problem in the graph belongs to a pack the
command selected, and each such pack presents at least one **unreadable-source**
problem — its manifest is missing, or present and undecodable — with only the
lock problems that unreadable manifest causes alongside it. The pack's
registration is then the removal target: its settings entry and its accepted
resolution are removed, and nothing else.

Uninstall stays blocked, and changes nothing, when any problem belongs to a
pack the command did not select or to no pack at all. Graph safety is unchanged
for incompleteness the target did not cause.

Content whose manifest cannot be read is never deleted. The result says so: the
plan unit carries a warning naming the pack, the reason, the unreadable
manifest, what was left in place, and the remedy, and the pack's canonical path
is reported unchanged rather than removed. Preview and apply reach this
decision from the same graph; a target whose readability changes between the
two phases is a stale candidate, not a different decision.

## Context

The desired-state graph is the input to every pack transition, and the
completeness gate exists so that no transition is computed from state AXM
cannot read. Applied to the graph's verdict as a whole, that gate also refused
to retire a pack whose _own_ package was the only thing missing — the most
common retirement case in practice, reached after content migration, a
hand-deleted pack directory, or a checkout that dropped it.

Recovery then required restoring a manifest purely to satisfy the gate and
deleting the scaffolding afterwards. The restored manifest carried no
information the gate needed: the graph builder skips a pack's member loop
whenever its manifest cannot be read or decoded, so the members were unknown
either way, and registration-only removal was the only outcome the graph could
compute.

A manifest confirmed absent, or present and undecodable, at a known path is
positive evidence about the removal target. It is not the absent evidence the
gate guards against. That distinction — between what is known about the target
and what is unknown about the graph — is what the decision draws.

## Consequences

- `axm packs uninstall <name>` and `axm uninstall <fqn>` share one plan
  builder, so both retire an unreadable pack identically.
- `pack-manifest-invalid` is treated exactly as `pack-manifest-unavailable`;
  the two are one unreadable-source condition.
- The lock problems a registry pack's unreadable manifest causes
  (`pack-manifest-content-mismatch` with status missing or changed, and
  `pack-resolution-unavailable`) are permitted alongside the primary problem.
  They restate its consequence and add nothing the gate needs.
- Readable-but-disagreeing state stays blocked: an identity mismatch, or a
  content mismatch on a manifest that decodes. That is drift or ambiguity, not
  absence, and fail-closed remains the rule for it.
- A workspace-authored pack directory was already never deleted; an acquired
  pack directory whose manifest is unreadable is now preserved too, because its
  identity cannot be verified against the accepted resolution.
- Members are never read from an unreadable manifest. They are recomputed from
  the remaining desired state, so a member no route still reaches is removed and
  a member another route reaches is retained and reported.
- The blocker identity `packs/uninstall/desired-state-graph-complete` is
  unchanged. Its detail now names the remedy for each pack that is blocking and
  was not selected.
- The machine result contract is unchanged in shape. The plan unit already
  carried warnings; what changed is what it says.

The accepted specification
`cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable` owns this
behavior; this record explains the choice.

## Alternatives

Retaining the fail-closed verdict was rejected because it would make the
restore-then-retire sequence the accepted contract for the most common
retirement case, with no safety gained — the restored manifest carries no
information the gate reads.

Permitting retirement from the registration alone, without inspecting which
pack a problem belongs to, was rejected because it would also proceed while a
pack other than the target was broken. That is exactly the condition the gate
exists to catch, and it would permit mutation when nothing about the target
could be read.

## Reconsideration

Reconsider if a pack's member list becomes durable outside its package manifest
— recorded in the accepted resolution, say — because a retirement could then
compute member removal from state the manifest no longer has to supply. Also
reconsider if evidence shows operators retiring packs whose content they expect
AXM to delete, which would call for an explicit opt-in rather than a change to
the default.
