---
type: Architecture
status: stable
description: How AXM manages canonical instruction files, agent aliases, and contributed regions.
depends-on:
  - ./overview.md
  - ./settings.md
  - ./agents.md
  - ./managed-file-ownership.md
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
The literal `false` disables reconciliation. Re-enabling establishes the
requested preferences again.

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

Ownership is inspected, never remembered. Every view a command plans from —
status, lint rules, readiness, cleanup, the sync plan — derives from one
observation: a single walk of the workspace discovers the propagation roots and
every path where a registry-known alias convention is present, the configured
agents expand into the expected plan, and target, residue, and `.gitignore`
facts are read against that plan at one moment. A mutation observes once more
immediately before writing and reads the workspace back afterwards rather than
reporting its pre-write observation. The snapshot is command-scoped data — not
a cache, a persisted ledger, or a service. Discovery does not enter directory
symlinks or a nested directory with its own `.git` or `.axm`, and agent
configuration directories named by a nested alias convention, such as
`.junie`, are never propagation roots.

An observed target is `absent`, `owned-current`, `owned-drift`, or `unowned`.
At a planned target the proof is a symlink that resolves to the canonical
source or any `axm:file` banner; outside the plan only a symlink to the
canonical file beside it or a banner carrying the instruction-alias identity
counts. An unowned file at a planned target is a collision: status and lint
name it as such, distinct from AXM-managed drift, and no reconciliation path —
including `axm lint --fix` — replaces it. An AXM-owned alias the current plan no longer desires, left behind
by a removed source root, a removed agent, or a changed canonical filename, is a
stale target: status lists it, lint reports it, and sync removes it before the
`.gitignore` region is rewritten, so an ignore entry never disappears while the
file it covered remains. Unowned files at undesired alias names are not AXM's
concern and are left alone without a report.

A contribution region is owned by its contributing capability, not by any
single extension. It is an aggregate ownership unit under the shared
[output reconciliation contract](overview.md#output-reconciliation): its
content is the deterministic rendering of every enabled extension the desired
state routes into it, whether the route is a direct declaration or Pack
membership. Enabling, disabling, or removing one contributing extension
re-renders the region from the remaining set; it never rewrites the region to
contain only the extension being operated on.

An absent region may be created when instruction management authorizes it. A
one-sided, duplicate, nested, or malformed marker sequence makes ownership
ambiguous and blocks the affected reconciliation. An unowned file at a required
alias path is a collision and remains untouched.

The shared [managed-file ownership grammar](managed-file-ownership.md) names
the Rules, Knowledge, Hook fallback, and instruction-alias units. Alias copies
carry a structured `axm:file` banner, while `.gitignore` uses the
`instruction-aliases` pattern-list region. Formatting-only changes do not
create drift, and AXM emits no formatter directives.

The canonical filename and alias behavior are durable instruction-file
settings choices. Contributor participation follows the contributor's own
activation and feature configuration. Sync realizes those choices but does not
enable the surface, select a different canonical file, or activate
contributors.

## Invariants

- Canonical authored prose survives enablement, reconciliation, and disablement.
- Each managed region is identifiable independently of the surrounding file
  and other regions.
- Each managed region contains every desired contribution routed into it,
  exactly once, regardless of which operation last wrote the region.
- Composition order is deterministic and repeated reconciliation adds no
  duplicate content.
- Agent aliases refer to the selected canonical source without becoming new
  canonical copies.
- Disabling a contributing capability removes only its owned region; disabling
  one contributing extension removes only that extension's contribution; and
  disabling instruction management removes only AXM-owned regions and aliases.
- Every write and removal decision rests on an ownership proof read from the
  workspace in the same command; no prior-ownership record is persisted.
- Removing a source root or an agent, or changing the canonical filename,
  leaves no AXM-owned alias behind after the next reconciliation and never
  removes a file AXM cannot prove it produced.
- A dry run names exactly the targets a real run would write and remove.

## Testing strategy

Behavior tests prove canonical prose preservation, contributor independence,
deterministic ordering, formatting changes, malformed and duplicate markers,
owned alias drift, unowned alias collisions, stale-alias discovery after a
removed nested root, a removed agent, and a changed canonical filename, cleanup
without a managed `.gitignore` region, dry-run parity with apply,
configured-agent transitions, safe disablement, scope isolation, nested
working-tree boundaries, and idempotent reconciliation.
