## Context

Four `SourceType` definitions exist with overlapping but inconsistent values:

- `extensions/sources.ts` - Schema.Literal, documented as "canonical"
- `extensions/common.ts` - Schema.Union, diverges (adds azuredevops/url/path, removes local)
- `resolution/types.ts` - plain type alias, duplicates sources.ts
- `extensions/skills/types.ts` - plain type alias, extends with `wellknown`

The `extensions/sources.ts` file is already documented as the canonical location but isn't being used consistently.

## Goals / Non-Goals

**Goals:**

- Single source of truth for `SourceType` in `extensions/sources.ts`
- Clear extension pattern for domain-specific additions (e.g., `wellknown`)
- All type consumers import from canonical location or its extensions

**Non-Goals:**

- Backward compatibility with existing import paths
- Runtime behavior changes
- Adding new source types (only consolidating existing)

## Decisions

### 1. Canonical schema location: `extensions/sources.ts`

Already documented as canonical. Uses Effect Schema.Literal which provides both runtime validation and type inference.

**Alternatives considered:**

- `extensions/common.ts` - rejected; it diverges too much and mixes multiple concerns
- New dedicated module - rejected; `sources.ts` already exists and is well-named

### 2. Unified value set: github, gitlab, bitbucket, git, registry, local

This is the set from `extensions/sources.ts` and `resolution/types.ts`.

**What about divergent values in `common.ts`?**

- `azuredevops` - add to canonical (legitimate source type)
- `url` / `path` - map to existing: `url` → `git` (generic URL), `path` → `local`

### 3. Extension pattern for skill-specific types

`extensions/skills/types.ts` needs `wellknown` for HTTP(S) URLs with well-known skills index. Use type extension:

```typescript
import { SourceType as BaseSourceType } from "../sources.js";
export type SourceType = BaseSourceType | "wellknown";
```

This keeps the base type clean while allowing domain-specific extensions.

### 4. Remove `SourceTypeSchema` from `common.ts`

The `common.ts` file should focus on manifest schemas (Author, ExtensionType, AgentId). Source types belong in `sources.ts`.

### 5. Resolution module imports from canonical

`resolution/types.ts` removes its local definition and imports from `extensions/sources.ts`.

## Type Definitions

### Canonical: `extensions/sources.ts`

```typescript
import * as Schema from "effect/Schema";

/**
 * Source type discriminator for extension origins.
 */
export const SourceSchema = Schema.Literal(
  "github",
  "gitlab",
  "bitbucket",
  "azuredevops",
  "git",
  "registry",
  "local",
);

export type SourceType = typeof SourceSchema.Type;
// Inferred: "github" | "gitlab" | "bitbucket" | "azuredevops" | "git" | "registry" | "local"
```

### Skills extension: `extensions/skills/types.ts`

```typescript
import type { SourceType as BaseSourceType } from "../sources.js";

/**
 * Source type for skill parsing. Extends base with wellknown for HTTP(S) URLs.
 */
export type SourceType = BaseSourceType | "wellknown";
// Result: "github" | "gitlab" | "bitbucket" | "azuredevops" | "git" | "registry" | "local" | "wellknown"
```

### Resolution: `resolution/types.ts`

```typescript
// Remove local definition, re-export from canonical
export type { SourceType } from "../extensions/sources.js";
```

### Common: `extensions/common.ts`

```typescript
// DELETE SourceTypeSchema and SourceType
// Consumers should import from extensions/sources.ts instead
```

## Risks / Trade-offs

**Risk: Import path churn** → Low impact; mostly internal imports. Run lint/typecheck to catch all usages.

**Risk: `common.ts` consumers expecting url/path** → Search for usages before removing. Map to equivalent types if needed.

**Trade-off: Two SourceType types exist (base + skills extension)** → Acceptable; skills domain has legitimate need for `wellknown`. Named imports make the distinction clear.
