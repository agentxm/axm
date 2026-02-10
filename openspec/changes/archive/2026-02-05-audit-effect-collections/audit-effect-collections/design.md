## Context

The codebase follows Effect collection patterns per `.claude/skills/effect-collections/SKILL.md`. An audit identified 3 instances of unsafe array index access that should use `Array.get()` instead.

## Goals / Non-Goals

**Goals:**

- Replace all unsafe array index access with `Array.get()` returning `Option<T>`
- Maintain existing behavior while improving type safety

**Non-Goals:**

- Adding new functionality
- Changing error messages or user-facing behavior
- Refactoring unrelated code

## Decisions

### Use `Array.get()` with immediate Option handling

Each violation will use `Array.get()` or `Array.head()` followed by appropriate Option handling based on context:

1. **git.ts (line 185-186)**: Use `Array.get` with `Option.getOrThrow` since this is parsing ls-tree output where malformed output indicates a bug
2. **service.ts select (line 131)**: Use `Array.get` with `Option.match` to convert None to existing PromptError
3. **service.ts multiselect (line 190)**: Replace `Option.fromNullable(items[index])` with `Array.get(items, index)` - already returns Option
4. **state/types.ts (line 333)**: Use `Array.head(v.issues)` with `Option.match` for recursive validity code extraction

## Risks / Trade-offs

- [Minimal risk] Pure refactoring with identical runtime behavior
- [Testing] Existing tests should pass unchanged; run full test suite to verify
