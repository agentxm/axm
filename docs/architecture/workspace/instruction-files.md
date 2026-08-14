---
status: stable
description: How AXM manages canonical instruction files, agent aliases, and contributed regions.
depends-on:
  - ./overview.md
  - ./settings.md
  - ./agents.md
---

# Instruction files

Instruction-file management is a workspace capability that keeps one canonical
instruction source, such as `AGENTS.md`, available through the filenames and
managed regions required by configured agents. It is useful independently of
whether the workspace installs reusable Rule extensions.

## Responsibilities

AXM records whether instruction-file management is enabled and which canonical
file the workspace selected. It creates and maintains only the aliases and
marked regions for which it can establish authority.

Enabled extension capabilities may contribute independently managed content:

- Rules contribute ordered behavior guidance;
- Knowledge contributes a compact discovery entry rather than concept content;
  and
- Hooks may contribute an explicitly supported instruction fallback.

AXM composes those contributions deterministically and reconciles them through
the ordinary workspace lifecycle and sync boundaries.

## Configuration and commands

Top-level `instructionFiles` settings record the workspace choice. An absent
value means the capability has not been configured. An object enables it by
default and records the canonical `fileName` and `gitignoreAliases` preference.
`enabled: false` disables reconciliation while retaining those preferences for
later re-enablement.

The root `axm instructions` command inspects this surface; `axm instructions
enable` and `axm instructions disable` express its activation. The family is
not subordinate to any extension type, and it has no separate `status` alias.
Changing instruction-file configuration reconciles the affected owned regions
and aliases as one operation; sync later restores that configured state but
does not make the choice.

## Non-responsibilities

AXM does not own the canonical file as a whole, replace user-authored prose,
turn every instruction into a Rule extension, or treat an existing alias as
permission to overwrite it. Enabling instruction management does not enable
every Rule, Knowledge bundle, or Hook, and enabling one contributor does not
grant authority over the shared surface.

Instruction management is not a general documentation synchronization or
policy-enforcement system.

## State and ownership

The workspace owns the canonical instruction file and all prose outside
AXM-owned regions. Each contribution region is a derived output with its own
type-specific identity. AXM owns an alias only when it created the alias for the
configured canonical source and can still prove that relationship.

An absent region may be created when instruction management authorizes it. A
one-sided, duplicate, nested, or malformed marker sequence makes ownership
ambiguous and blocks the affected reconciliation. An unowned file at a required
alias path is a collision and remains untouched.

The canonical filename and alias behavior are durable instruction-file
settings choices. Contributor participation follows the contributor's own
activation and feature configuration. Sync realizes those choices but does not
enable the surface, select a different canonical file, or activate
contributors.

## Invariants

- Canonical authored prose survives enablement, reconciliation, and disablement.
- Each managed region is identifiable independently of the surrounding file
  and other regions.
- Composition order is deterministic and repeated reconciliation adds no
  duplicate content.
- Agent aliases refer to the selected canonical source without becoming new
  canonical copies.
- Disabling a contributor removes only its owned region; disabling instruction
  management removes only AXM-owned regions and aliases.

## Testing strategy

Behavior tests prove canonical prose preservation, contributor independence,
deterministic ordering, formatting changes, malformed and duplicate markers,
owned alias drift, unowned alias collisions, configured-agent transitions,
safe disablement, scope isolation, and idempotent reconciliation.
