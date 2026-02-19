## Context

The current skills install implementation uses ad-hoc state comparison and a 5-way change type (Add/Update/Remove/Unchanged/Repair). The new desired-state reconciliation pattern is fully designed in `docs/designs/dry-run.md` and provides:

- Clear separation: current state → ideal state → plan → apply
- Pure diffing function (`buildPlan`) for easy testing
- Trivial dry-run via `applyPlan(plan, { dryRun: true })`
- Issues computed during state loading (not separate validity step)

This change implements that design for the skills install command.

## Goals / Non-Goals

**Goals:**

- Implement reconciliation pattern from `docs/designs/dry-run.md`
- Update lockfile and settings schemas per design
- Establish pattern for future extension commands (update, uninstall)

**Non-Goals:**

- Backward compatibility with existing lockfile/settings format
- Registry source type (deferred; only GitHub and Local for now)
- Automatic migration of existing installations

## Decisions

### D1: Reference existing design document

**Decision**: Use `docs/designs/dry-run.md` as the authoritative technical design.

**Rationale**: The design is comprehensive (1200+ lines) with types, algorithms, and code examples. Duplicating here would cause drift.

**Alternatives**: Copy design content into this file → Rejected due to maintenance burden.

### D2: Install path change

**Decision**: Move from `.axm/skills/<name>` to `.axm/extensions/@<namespace>/skills/<name>` (registry) or `.axm/extensions/external/skills/<name>` (GitHub/local).

**Rationale**: Consistent with multi-extension-type future; separates registry vs external sources.

**Alternatives**: Keep flat `.axm/skills/` → Rejected; doesn't scale to registries.

### D3: No automatic migration

**Decision**: Users must reinstall skills after upgrade; no migration script.

**Rationale**: Early stage, few users, clean break preferred over migration complexity.

**Alternatives**: Write lockfile migration → Adds complexity for minimal benefit at this stage.

### D4: No rollback on apply failure

**Decision**: On failure, stop and return partial result. Lockfile/settings only updated on full success.

**Rationale**: Rollback doubles implementation complexity. Partial state is observable via `axm doctor` and recoverable via reinstall.

**Alternatives**: Checkpoint and rollback → Rejected per design doc rationale.

## Risks / Trade-offs

| Risk                                       | Mitigation                                                  |
| ------------------------------------------ | ----------------------------------------------------------- |
| Breaking change to schemas                 | Document in release notes; users reinstall                  |
| Existing skills orphaned after path change | `axm doctor` detects; manual cleanup or reinstall           |
| Design doc and code drift                  | Link to design doc in code comments; review both on changes |

## Code Mapping

From `docs/designs/dry-run.md` § Code Mapping:

| Existing                 | New                    | Notes                                      |
| ------------------------ | ---------------------- | ------------------------------------------ |
| `ParsedSource`           | `SkillSource`          | Add `_tag`, `Registry` variant             |
| `ActualSkill`            | `ActualSkill`          | Add `issues`, remove `validity`            |
| `LockedSkill`            | `LockedSkill`          | `folderHash` → `gitTreeHash`, add `agents` |
| `SkillState`             | `SkillState`           | Replace `validity` with `issues`           |
| `SkillChange`            | `PlanStep`             | Collapse to 3-way; drop Unchanged/Repair   |
| `loadSkillsState()`      | `loadCurrentState(ws)` | Returns `CurrentState`                     |
| `buildIdealForInstall()` | `buildIdealState()`    | Generalize to commands                     |
| `computeDiff()`          | `buildPlan()`          | Pure function, returns `Plan`              |
