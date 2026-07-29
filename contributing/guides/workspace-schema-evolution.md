# Workspace Schema Evolution Guide

How `.axm/settings.json`, `.axm/trust.json`, and `.axm/axm-lock.yaml` tolerate
data they do not understand, and the rules for changing these schemas. Use this guide before
adding, renaming, or removing a top-level workspace field, or before changing
decode strictness anywhere on a workspace read or write path.

Read [Workspace State](workspace-state.md) first: settings declare desired
state, trust preserves security-critical identity, and the lockfile is optional
receipt history.

## Key Resources

- [packages/core/src/unstable/settings/schema.ts](../../packages/core/src/unstable/settings/schema.ts) - settings schema
- [packages/core/src/unstable/lockfile/schema.ts](../../packages/core/src/unstable/lockfile/schema.ts) - lockfile schema
- [packages/core/src/unstable/trust/schema.ts](../../packages/core/src/unstable/trust/schema.ts) - trust-state schema
- [packages/core/src/unstable/workspace/read-model/state.ts](../../packages/core/src/unstable/workspace/read-model/state.ts) - decode pipeline
- [Workspace Read Model Guide](workspace-read-model.md) - read-model cells and caching

## The invariant

**A write never discards data it did not create.** Preserving unknown fields is
a data-integrity property, not a compatibility promise: AXM is pre-launch and
makes clean breaks, but a git-tracked settings file or a lockfile shared across
tools must survive a read-modify-write cycle without silent data loss.

## How tolerance is scoped

Both top-level schemas are `Schema.StructWithRest(base, [Schema.Record(String,
Unknown)])`:

- **Top level: tolerate and preserve.** Unknown top-level keys decode into the
  value, survive `writeSettings` (appended after the canonical
  `SETTINGS_KEY_ORDER` keys) and `commitLockfileSnapshotUpdate` (carried from
  the on-disk snapshot), and re-serialize value-identically. Steady-state
  write cycles are byte-identical.
- **Nested: strict.** Entry objects keep `onExcessProperty: "error"` semantics;
  an unknown key inside a skill entry or lock entry still fails decode. Do not
  loosen nested decodes with a blanket `onExcessProperty` option — ParseOptions
  apply recursively, which is why the rest record is the only top-level-only
  mechanism.
- **Removed legacy keys: rejected loudly.** `libraries` and `ignored` are
  matched by explicit pre-decode guards (`REMOVED_SETTINGS_KEY_ISSUES` in
  `state.ts`, the `libraries` guards on the lockfile read paths) with targeted
  guidance. A key we deliberately removed is a user error, not forward-compat
  data.

## How problems are reported

- Invalid settings values (or nested unknown keys) are **validation** failures:
  exit 9, with the offending dot-path named in the error detail. They are never
  `internal` (exit 10) — the user can fix the file.
- Unknown top-level settings keys do not fail commands. The
  `workspace/settings-keys-recognized` lint rule reports each one at **error**
  severity with a did-you-mean suggestion. The generated JSON Schemas permit
  additional top-level properties, so this rule is the guardrail editors no
  longer provide.

## Rules for changing a workspace schema

1. **Adding an optional field** needs no version bump: older data simply lacks
   the key, newer data rides the rest record through older code. Land the
   schema field and its readers atomically.
2. **Do not bump `LOCKFILE_VERSION`** for additive fields. There is no version
   dispatch or migration path; a bump adds rejection without useful version
   behavior.
3. **Removing a field** adds it to the removed-keys guard with a targeted
   message. Never let a removed key fall through to silent preservation.
4. **Renaming a field** is a removal plus an addition — hard cut with a
   changelog migration note, no dual emission or aliases.
5. **Regenerate the JSON Schemas** (`pnpm exec nx run core:generate:schemas`)
   whenever either schema changes; the generated files are committed and
   asserted by `generated-schema.test.ts`.
6. **Prove preservation.** Any new write path for settings or the lockfile
   needs a test that an unknown top-level key survives its full cycle
   value-identically (see `settings.test.ts` "preserves unknown top-level keys"
   and `lockfile.test.ts` "preserves unknown top-level lockfile keys").
