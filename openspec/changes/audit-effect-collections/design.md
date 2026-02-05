## Context

The `/effect-collections` skill defines conventions for collection types in Effect codebases. These conventions improve consistency and leverage Effect's type aliases that signal immutability. The codebase has grown organically and compliance has not been systematically verified.

## Goals / Non-Goals

**Goals:**

- Audit all TypeScript files for collection type compliance
- Fix violations to match `/effect-collections` conventions
- Ensure linting passes after changes

**Non-Goals:**

- Changing runtime behavior
- Refactoring logic or algorithms
- Adding new Effect utilities where not already used

## Decisions

### 1. Type Signature Replacements

| Pattern                                | Replacement                        | Rationale                               |
| -------------------------------------- | ---------------------------------- | --------------------------------------- |
| `T[]` in signatures                    | `Array.Array<T>`                   | Effect convention, signals immutability |
| `ReadonlyArray<T>`                     | `Array.Array<T>`                   | Equivalent type, consistent naming      |
| `readonly T[]`                         | `Array.Array<T>`                   | Equivalent type, consistent naming      |
| `Record<string, V>` (readonly context) | `Record.ReadonlyRecord<string, V>` | Effect convention for readonly records  |

**Exceptions:**

- Mutable arrays in local scope (e.g., building up results) can remain `T[]`
- External API boundaries may keep native types for interop

### 2. Audit Scope

Search patterns to identify violations:

- `: T[]` — array type annotations
- `: ReadonlyArray<` — explicit readonly arrays
- `: readonly ` — readonly tuple/array shorthand
- `: Record<` — record type annotations (evaluate if readonly)

Files to audit:

- `packages/cli/src/**/*.ts`

Exclude:

- Test files (`.test.ts`) — less critical for type conventions
- Generated files
- Node modules

### 3. Verification

After changes:

1. `pnpm typecheck` — ensure no type errors introduced
2. `pnpm lint` — ensure linting passes
3. `pnpm test` — ensure no behavioral changes

## Risks / Trade-offs

**[Risk] Large number of changes** → Review in batches by package/feature area

**[Risk] Import additions for `Array` or `Record`** → Ensure imports are added where types are used

**[Risk] Mutable array misidentification** → Manual review of each instance to determine if truly readonly
