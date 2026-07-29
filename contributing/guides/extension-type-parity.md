---
status: active
last-reviewed: 2026-07-29
version: 0.1.0
description: How the extension type table drives every per-type surface, what the
  parity obligations and exemption ledger enforce, and the checklist for adding a
  new extension type. Read before adding an extension type, adding a per-type
  surface, or changing a parity obligation.
depends-on: []
---

# Extension Type Parity

AXM has nine extension types. Every one of them needs the same surfaces: a
plural command namespace, a manifest schema, a lock entry, a help topic, a
renderer entity, an install path an end-to-end test drives. Historically those
surfaces were added type by type, so a type added late silently skipped
whichever ones nobody remembered. This guide covers the machinery that makes
that impossible, and what you have to do when you add the tenth type.

## Key Resources

- [`extensions/common.ts`](../../packages/core/src/unstable/extensions/common.ts) — `EXTENSION_TYPE_TABLE`, the naming and axis source of truth
- [`extension-types/catalog.ts`](../../packages/core/src/unstable/extension-types/catalog.ts) — Per-type summary, description, governing standard, and doc links
- [`extension-types/standards.ts`](../../packages/core/src/unstable/extension-types/standards.ts) — The open standards types are grounded in
- [`parity/obligations.ts`](../../packages/core/src/unstable/extension-types/parity/obligations.ts) — The obligations and the tier that verifies each
- [`parity/exemptions.ts`](../../packages/core/src/unstable/extension-types/parity/exemptions.ts) — The debt ledger
- [`scripts/parity-ledger-check.ts`](../../scripts/parity-ledger-check.ts) — The shrink-only ledger gate

---

## The table is the source of truth

`EXTENSION_TYPE_TABLE` holds one row per type. Row order is the canonical
display order, and every naming export in the module — plurals, labels,
sentence labels, the FQN pattern — is derived from it. A new type is exactly
one new row: a missing column is a compile error, an excess column is a compile
error, and every downstream `satisfies Record<ExtensionType, _>` table fails
until the type has been decided there too.

The row's capability axes are what make the obligations conditional rather than
universal:

| Axis                  | Question it answers                                                |
| --------------------- | ------------------------------------------------------------------ |
| `distribution`        | How does a package reach a workspace?                              |
| `placement`           | Does install write into agent-owned or workspace-owned locations?  |
| `governs`             | Does the governing standard cover the package body or a host file? |
| `installInputs`       | Does install accept user-provided inputs?                          |
| `workspaceCapability` | Does the type also toggle a workspace-level capability?            |

Axis-derived unions (`PerAgentType`, `WorkspaceType`, `RegistryType`,
`InputType`, `BodyGovernedType`, `WorkspaceCapabilityType`) are never
hand-written. Changing an axis on a row rewrites every union, and the
exact-membership pins in
[`extension-type-table.type-test.ts`](../../packages/core/src/unstable/extensions/__tests__/extension-type-table.type-test.ts)
fail compile in both directions when a union gains or loses a member.

Derive from the axes, not from name literals. Root help groups its commands by
`workspaceCapability` rather than excluding `rules` by name, so the tenth type
lands in the right group without anyone editing the group.

## Obligations, tiers, and the ledger

An obligation is one statement that must hold for every catalog type — "the
lock entry accepts an advisory `sourceHash`", "`axm help <plural>` resolves to a
prose topic". Ids are stable strings (`<area>.<n>-<label>`) and appear in ledger
rows, failure messages, and skipped e2e titles, so renaming one is a breaking
change to every reference.

Each obligation names the tier that can observe it:

| Tier        | Suite                                                                                      | Sees                                   |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| `core-test` | [`parity.test.ts`](../../packages/core/src/unstable/extension-types/parity/parity.test.ts) | Schemas, lock entries, settings config |
| `cli-test`  | [`parity-cli.test.ts`](../../packages/cli/src/parity-cli.test.ts)                          | Help topics, renderer entities         |
| `e2e`       | [`root-install.e2e.test.ts`](../../packages/cli-e2e/src/root-install.e2e.test.ts)          | Real publish-then-install round trips  |

Every suite iterates the types from the catalog and compares what it observed
against the ledger, filtered to its own tier, with exact equality. That
equality runs in **both** directions:

- a type that starts failing an obligation without a ledger row fails the
  suite, so a regression cannot land quietly;
- a type that starts _meeting_ an obligation whose row is still in the ledger
  also fails the suite, so a fix cannot leave stale debt behind.

The second direction is the one that surprises people. Landing the fix and
deleting the ledger row are the same change — split them across two commits and
the suite is red in between.

`seed: true` marks rows that existed when the ledger was introduced.
`parity-ledger-check` compares the seeded-row count against `main` and fails
when it rises, which makes the ledger shrink-only: a newly discovered gap can
never be laundered into pre-existing debt. New rows for genuinely new work are
allowed, unseeded, but they need a reason a reader can act on and a tracking
issue.

`exemptions.ts` is the single designated file where extension-type name
literals may appear in the parity harness. Everywhere else, derive.

## Adding a tenth extension type

1. **Add the row** to `EXTENSION_TYPE_TABLE` with all axes decided. Compile and
   read the errors — they are the worklist.
2. **Add the catalog entry** in `extension-types/catalog.ts` with a summary,
   description, governing standard (or an explicit `null`), and doc links. Add
   the standard to `standards.ts` if it is new.
3. **Work the compile errors** across the manifest schema, lock entry, settings
   config, install and publish operations, and renderer entity.
4. **Add the prose help topic** at `packages/cli/help/topics/<plural>.md` and a
   one-line description in `help-topic-descriptions.ts`. A spec-tracked type's
   topic must cite its standard's URL — `help-standards.test.ts` enforces it.
5. **Register the command** in `EXTENSION_TYPE_COMMANDS`. Root help picks up
   the group placement from the `workspaceCapability` axis.
6. **Add the e2e install row**, or a matching `6.1-e2e-install-row` ledger row
   naming what blocks it.
7. **Decide every remaining obligation.** Either meet it, or add a ledger row
   with a reason and a tracking issue. The conformance suites will not let you
   skip this step.
8. **Regenerate.** `pnpm run generate:check` fails when catalog-derived docs
   have not been regenerated.

---

## See Also

- [Agent Capability Model](./agent-capabilities.md) — how agents are graded against these types
- [CLI Design Guide](./cli-design.md) — command shape for a new type namespace
- [Testing Guide](./testing.md) — where each conformance tier runs
