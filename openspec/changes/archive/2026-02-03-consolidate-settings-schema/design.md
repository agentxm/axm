## Context

The codebase has three separate definitions for Settings:

1. **`schemas/settings.ts`** - Canonical Effect Schema with full validation (FQN pattern, AgentId, SourcesConfig). All fields optional.
2. **`skills/settings.ts:21-28`** - Local `SettingsSchema` with plain strings, no FQN validation. `agents` and `skills` required.
3. **`skills/types.ts:93-106`** - TypeScript `Settings` interface with `agents` and `skills` required.

The `skills/` module was likely created before the canonical schema existed, or evolved independently. The result is validation inconsistencies and duplicated maintenance.

## Goals / Non-Goals

**Goals:**

- Single source of truth for Settings schema in `schemas/settings.ts`
- Remove duplicate schema and type definitions from `skills/` module
- All fields remain optional per the existing `schema-settings` spec

**Non-Goals:**

- Backward compatibility with code expecting required `agents`/`skills` fields
- Changes to the canonical schema structure
- Migration tooling for existing settings files

## Decisions

### Decision 1: Import canonical schema type, not the schema itself

The `skills/settings.ts` module needs the `Settings` type for function signatures but doesn't need to re-validate with the schema (validation happens at parse time).

**Approach**: Import `type { Settings }` from `../schemas/settings.js` instead of defining a local interface.

**Alternative considered**: Import and use the full `Settings` schema for re-validation. Rejected because validation already happens in `readSettings` - no need to validate twice.

### Decision 2: Use Schema.decodeUnknown with canonical schema

Replace the local `SettingsSchema` validation with `Schema.decodeUnknown(Settings)` from the canonical schema.

**Approach**: Import `Settings` schema from `../schemas/settings.js` and use it in `readSettings`.

### Decision 3: Update createDefaultSettings to return empty object

Currently returns `{ agents: [], skills: {} }`. With all fields optional, the minimal valid settings is `{}`.

**Approach**: Return `{}` from `createDefaultSettings()`. Callers that need defaults should handle undefined fields.

### Decision 4: Update function signatures for optional fields

Functions like `getEffectiveScope`, `addSkill`, `updateSettings` assume `skills` exists. They need to handle undefined.

**Approach**: Use nullish coalescing (`??`) and optional chaining (`?.`) where fields are accessed.

## Risks / Trade-offs

**[Risk]** Callers assume `agents` and `skills` are always present → **Mitigation**: This is a breaking change. Callers must update to handle optional fields. TypeScript will catch most issues at compile time.

**[Risk]** Empty settings `{}` may confuse users → **Mitigation**: The spec explicitly allows empty settings. CLI commands can provide sensible defaults when fields are missing.

**[Trade-off]** More defensive code in settings operations → Acceptable cost for schema consistency and spec compliance.
