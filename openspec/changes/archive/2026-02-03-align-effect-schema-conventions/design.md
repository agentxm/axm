## Context

Schema definitions in `packages/core/src/experimental/schemas/` use a pattern where schema constants share names with their inferred types:

```typescript
// Current (non-conforming)
export const Author = Schema.Struct({ ... });
export type Author = typeof Author.Type;
```

This conflicts with the effect-schema skill convention and causes workarounds:

- `schemas/index.ts` exports awkward aliases (`AuthorType`, `AgentIdType`)
- `skills/settings.ts` manually renames on import: `Settings as SettingsSchema`

Meanwhile, `skills/state/types.ts` already follows the correct pattern:

```typescript
// Correct convention
export const SkillFrontmatterSchema = Schema.Struct({ ... });
export interface SkillFrontmatter { ... }
```

## Goals / Non-Goals

**Goals:**

- Rename all schema constants in `schemas/` to use `<TypeName>Schema` suffix
- Maintain types as `<TypeName>` (no suffix)
- Update all import sites to use new names
- Simplify `schemas/index.ts` by removing workaround aliases
- Ensure all tests pass after refactoring

**Non-Goals:**

- Backward compatibility (this is a breaking change to internal APIs)
- Changing runtime behavior
- Modifying `skills/state/types.ts` (already conforming)

## Decisions

### 1. Rename pattern: `<Name>` → `<Name>Schema`

**Decision:** Schema constants get `Schema` suffix, types remain unchanged.

```typescript
// Before
export const Settings = Schema.Struct({ ... });
export type Settings = typeof Settings.Type;

// After
export const SettingsSchema = Schema.Struct({ ... });
export type Settings = typeof SettingsSchema.Type;
```

**Rationale:** Matches effect-schema skill convention and existing `skills/state/types.ts` pattern.

### 2. Update order: definitions first, then imports

**Decision:** Update in dependency order:

1. Schema definition files (`common.ts`, `settings.ts`, `lockfile.ts`, `manifest-*.ts`)
2. Barrel file (`schemas/index.ts`)
3. Consumer files (settings.ts, types.ts, generate-schemas.ts, tests)

**Rationale:** Prevents intermediate broken states. Schema files are leaves in the dependency graph.

### 3. Remove workaround aliases in barrel

**Decision:** Simplify `schemas/index.ts`:

```typescript
// Before (workaround)
export type { Author as AuthorType } from "./common.js";
export { Author } from "./common.js";

// After (clean)
export type { Author } from "./common.js";
export { AuthorSchema } from "./common.js";
```

**Rationale:** With proper naming, no aliases needed. Types and schemas have distinct names.

### 4. Handle `CommonManifestFields` (not a schema)

**Decision:** Keep `CommonManifestFields` unchanged (no `Schema` suffix).

**Rationale:** It's a plain object of schema fields used with spread, not a standalone schema:

```typescript
export const CommonManifestFields = {
  name: FullyQualifiedNameSchema,
  version: Schema.String,
  // ...
};
```

## Risks / Trade-offs

**[Risk] Missed import site** → Run `pnpm typecheck` after each file update to catch breaks early.

**[Risk] Test failures from renamed imports** → Update test imports alongside source files.

**[Trade-off] Breaking change** → Acceptable per project rules (backward compatibility is a non-goal for experimental APIs).

## Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] No remaining workaround aliases in `schemas/index.ts`
- [ ] All schema constants follow `<Name>Schema` pattern
