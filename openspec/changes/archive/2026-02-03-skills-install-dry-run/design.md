## Context

The full architectural design is documented in [docs/designs/dry-run/dry-run-sketch.md](../../../docs/designs/dry-run/dry-run-sketch.md). This change implements the Skills portion as the reference implementation.

Current `skills install` executes file operations directly. The refactored approach introduces a state-based architecture where:

1. **Load** current state (actual from disk + locked from lockfile)
2. **Build** ideal state for the operation
3. **Diff** current vs ideal to produce a plan
4. **Display** the plan (dry-run stops here)
5. **Apply** the plan (real execution continues)

## Goals / Non-Goals

**Goals:**

- Add `--dry-run` flag to preview installation without side effects
- Add `--json` flag for machine-readable plan output
- Refactor handler to state-based architecture
- Implement `skills-state` module as foundation for other commands

**Non-Goals:**

- Other extension types (commands, MCP servers, packs) — future changes
- `doctor`, `sync`, `prune` commands — future changes using same infrastructure
- Staleness detection (time-based cache invalidation)
- Atomic pack installation

## Decisions

| Decision         | Choice                                               | Rationale                                                              |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Architecture     | State diffing (Arborist-style)                       | Unified validation, natural idempotency, reusable for doctor/sync      |
| State separation | actual + locked → merged with validity               | Clear provenance, supports all comparison scenarios                    |
| Tagged unions    | Plain interfaces + `_tag` discriminator              | Simple domain types; exhaustive switch for pattern matching            |
| Schemas          | Plain interfaces for domain, Schema at boundaries    | JSON serialization only where needed (`--json` output)                 |
| Data structures  | Immutable Record/Array                               | FP-friendly, works with Effect combinators, natural JSON serialization |
| Validity codes   | Static codes (E001, W001, etc.)                      | Stable IDs for docs, automation, suppression; severity from prefix     |
| Folder hash      | Git tree hash                                        | Deterministic, cross-platform; matches lockfile schema                 |
| Apply phases     | Sequential: files → agent sync → settings → lockfile | Lockfile updated last as source of truth                               |
| Rollback         | Effect.acquireRelease with checkpoint                | Handles both errors and Ctrl+C interruption                            |

See the [design sketch](../../../docs/designs/dry-run/dry-run-sketch.md) for full decision rationale and alternatives considered.

## Risks / Trade-offs

| Risk                                            | Mitigation                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Dry-run clones remote repos to analyze contents | Clear messaging: "Fetching source to analyze contents..."   |
| State loading adds latency vs direct operations | Acceptable for correctness; parallel loading where possible |
| Breaking change to handler internals            | Internal refactor; CLI interface unchanged except new flags |

## Migration Plan

1. Implement `skills-state` module in `packages/core/src/experimental/skills/state/`
2. Add types, loading, ideal builders, diff computation
3. Add apply logic with progress events
4. Refactor `skills install` handler to use new module
5. Add `--dry-run` and `--json` flags
6. Update/add tests (unit for state logic, E2E for dry-run behavior)

No user migration required — this is an additive change with new flags.
