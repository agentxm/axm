---
type: Decision
status: stable
description: The accepted decision that workspaces opt into the official AXM skill through declared desired state.
depends-on:
  - ../commands/lint.md
  - ../workspace/settings.md
  - ../workspace/invariants.md
---

# Official AXM skill is opt-in

## Context and forces

AXM workspaces declare the extensions they want in `axm.json`. The official
`@agentxm/skills/axm` skill had nevertheless been treated as a workspace-wide
invariant: lint reported an error whenever the skill was absent, including in
workspaces that never selected it. That collapsed absent-by-intent and
declared-but-missing states even though they have different meaning and
recovery.

The design must preserve explicit workspace intent, keep genuine CLI/skill
compatibility failures actionable, support both direct and Pack-mediated
declarations, and make the optional capability discoverable without adding a
second opt-out setting.

## Accepted choice

The official AXM skill is opt-in. A workspace declares that intent through a
direct `skills.axm` entry naming the official skill or through an installed Pack
member that resolves to it. Absence of both means the workspace did not select
the official skill.

Compatibility evaluation applies only after that declaration exists. An
undeclared workspace receives an informational discoverability finding and no
compatibility result. A declared workspace retains compatibility errors and
recovery when its official skill is absent, unreadable, or incompatible.

`axm setup` may seed the declaration when it creates a new workspace. It does
not turn the skill into a workspace invariant or add it while adopting existing
desired state.

Accepting authority: maintainer decision recorded on 2026-09-02. The binding
outcomes are owned by the executable specifications
`cli/lint/undeclared-official-skill-is-informational`,
`cli/lint/declared-official-skill-must-be-compatible`, and
`cli/lint/compatibility-result-names-reason-and-recovery` in the
[specification catalog](../../../specifications/catalog.md); this record owns
the architectural choice and rationale.

## Rationale

The `skills` map already expresses extension intent, so another opt-out key
would create competing authority. Keeping presence separate from compatibility
also preserves the meaning of `workspace/axm-skill-compatible`: it evaluates a
selected official skill rather than asserting that every workspace must select
one.

Pack membership counts because it is another deliberate declaration mechanism.
Ignoring it would hide compatibility drift from workspaces that selected the
official skill through composition.

## Material alternatives

- **Require the skill in every workspace.** Rejected because it invents intent
  and forces unrelated workspaces to install an extension they did not choose.
- **Require local suppression.** Rejected because suppression hides both
  intentional absence and later compatibility failures, while duplicating the
  intent already expressed by `skills`.
- **Emit nothing when undeclared.** Rejected because the opt-in would be
  invisible until a user encountered separate documentation or chose an
  install command. An informational rule keeps discovery machine-readable and
  does not affect command success.
- **Recognize only direct declarations.** Rejected because Pack membership is
  desired-state authority and must retain the same compatibility protection.

## Consequences

Positive:

- lint no longer reports absence as a violated invariant for workspaces that did
  not select the skill;
- declared-but-missing and incompatible installations remain errors with their
  established recovery facts;
- machine output distinguishes the states by rule identity and by presence of
  the compatibility result; and
- no compatibility sentinel, fallback, alias, or migration path is introduced.

Negative:

- workspaces that do not select the skill receive one informational finding by
  default; and
- consumers of lint JSON must treat `axmSkillCompatibility` as conditional on
  declared intent.

## Supersession and reconsideration

Reconsider this choice if workspace desired-state authority changes, Pack
membership stops expressing extension intent, or product evidence shows that
the informational discovery surface creates more cost than value. Any changed
obligation requires an executable specification revision and maintainer review.
