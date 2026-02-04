## Context

The CLI currently defines `--verbose` / `-v` and `--quiet` / `-q` as global flags in `main.ts`. These flags are passed through command argument interfaces and stored in the `OperationContext` service, but no code actually reads or acts on these values. They exist as dead code.

## Goals / Non-Goals

**Goals:**

- Remove all verbose/quiet flag definitions and references
- Simplify CLI interface and reduce maintenance burden
- Clean removal with no orphaned code

**Non-Goals:**

- Preserving backward compatibility (breaking change is acceptable)
- Adding alternative output control mechanisms
- Implementing verbose/quiet behavior before removing it

## Decisions

### Decision: Complete removal vs deprecation warning

**Choice**: Complete removal

**Rationale**: The flags have never been functional. Adding deprecation warnings would require implementing the flags first just to warn about their removal. Users relying on these flags are already getting no benefit from them.

**Alternative considered**: Add deprecation warnings for a release cycle before removal. Rejected because there's no behavior to deprecate—just unused flag definitions.

### Decision: Remove from OperationContext vs keep for future use

**Choice**: Remove `verbose` property from `OperationContextConfig`

**Rationale**: YAGNI. If verbose output is needed later, it can be re-added with actual implementation. Keeping unused properties creates confusion about what's functional.

## Risks / Trade-offs

**[Risk]** Scripts using `--verbose` or `--quiet` will fail with "Unknown argument" error
→ **Mitigation**: Acceptable breaking change. Document in release notes. Flags never did anything, so behavior doesn't change—only error handling does.

**[Risk]** Future need for verbose output requires re-adding the flag
→ **Mitigation**: Simple to add back when needed with actual implementation. Not worth keeping dead code.
