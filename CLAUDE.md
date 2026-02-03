# axm

Open agent extension manager for skills and more

Use extereme brevity and concision in all AGENTS.md and CLAUDE.md and SKILL.md instructions.

## Values

1. **Simplicity** - Clear, minimal, obvious.
2. **Reliability** - Trustworthy, resilient.
3. **Delight** - Intuitive, helpful, honest, responsive.
4. **Friendliness** - Welcoming, collaborative, open.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Standard library**: Effect (concurrency, type safety, error handling, async, observability)
- **Package manager**: pnpm (workspaces)
- **CLI parsing**: yargs
- **CLI UI**: Bombshell (prompts, forms, validation)
- **Testing**: Vitest
- **Formatting/Linting**: Biome (code), Prettier (markdown)

## Commands

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `pnpm build`     | Build all packages          |
| `pnpm test`      | Run all tests (Vitest)      |
| `pnpm test:e2e`  | Run E2E tests only          |
| `pnpm typecheck` | Type check without emitting |
| `pnpm format`    | Format code and markdown    |
| `pnpm lint`      | Lint with Biome             |
| `pnpm lint:fix`  | Lint and auto-fix           |

## Testing

- [ ] Designs prescribe testing for key elements
- [ ] Write tests first to define desired behavior
- [ ] Implement until tests pass
- [ ] Bug fix → regression test first
- [ ] **Unit tests** for pure functions, handlers, business logic, error paths
- [ ] **E2E tests** for CLI parsing, file system integration, user-facing behavior

### Test Quality

- [ ] **Isolated** — Same results regardless of run order
      → Use fresh state per test (temp dirs, mock resets)
- [ ] **Deterministic** — Same result if nothing changes
      → Remove shared mutable state between tests
- [ ] **Behavioral** — Sensitive to behavior changes
      → Test what the code does, not how it's structured
- [ ] **Structure-insensitive** — Refactoring shouldn't break tests
      → Avoid testing implementation details
- [ ] **Specific** — Failure cause obvious
      → One logical assertion per test
- [ ] **Readable** — Comprehensible, motivation clear
      → Use descriptive names and arrange/act/assert structure
- [ ] **Predictive** — Passing means production-ready
      → Test real scenarios, not just happy paths

## Effect

- [ ] Use `Array.Array`, `Record.Record`, and `Option.Option` from Effect, not built-in types
- [ ] Prefer `Option<T>` over `T | undefined` or optional properties (`prop?: T`)
- [ ] No raw Promises or async/await (use Effect.promise to wrap)
- [ ] Errors are typed in the Effect signature
- [ ] Dependencies use services, not direct imports
- [ ] Resources use acquire/release patterns
- [ ] Layers provide dependencies at the edge
- [ ] Use concurrency (Effect.all, Effect.forEach) where parallelization is possible
- [ ] Wrap Promise-based APIs with Effect conventions (see /effect-wrapping skill)

### Handlers

Handlers are effectful entry points that wire together business logic:

- Serve as program entry points (CLI commands, API routes)
- Accept parsed input and return Effects
- Require services provided via layers

Example: `handleInit(args: InitArgs)` is the entry point for the `init` command, separate from yargs parsing.

<!-- effect-solutions:start -->

### Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `.reference/effect/` for real implementations (run `effect-solutions setup` first)

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

<!-- effect-solutions:end -->

## TypeScript

### Minimize Type Assertions

Avoid `as` casts. Prefer type-safe alternatives:

| Pattern                  | Solution                                     |
| ------------------------ | -------------------------------------------- |
| `"literal" as UnionType` | Use `satisfies` on the object                |
| Mutable optional props   | Spread conditionals `...(x && { x })`        |
| Mock objects             | Cast once at boundary with `as unknown as T` |
| Caught errors            | Use type guards or Effect's Cause utilities  |

**`satisfies` over casting:**

```typescript
// Bad: type assertion
return { type: "local" as SourceType, ... };

// Good: satisfies validates the shape
return { type: "local", ... } satisfies ParsedSource;
```

**Conditional optional properties:**

```typescript
// Bad: mutation with cast
const obj: T = { required };
if (optional) (obj as { opt?: string }).opt = optional;

// Good: spread conditional
const obj: T = { required, ...(optional && { optional }) };
```

**Complex interface mocks (yargs, etc.):**

```typescript
// Acceptable: cast once at boundary, not throughout
const mock = { method: vi.fn().mockReturnThis() };
builder(mock as unknown as ComplexInterface);
```

**Library types that don't narrow (e.g., @clack/prompts):**

```typescript
// Bad: cast after cancel check (TS doesn't narrow)
if (p.isCancel(result)) {
  process.exit(0);
}
const value = result as string;

// Good: assertion function bridges the gap
function assertNotCancel<T>(result: T | symbol): asserts result is T {
  if (typeof result === "symbol") throw new Error("Unexpected cancel");
}
if (p.isCancel(result)) {
  process.exit(0);
}
assertNotCancel(result);
const value = result; // TS knows it's string

// Acceptable: cast with comment when library loses type info (e.g., dynamic config)
// Cast needed: multiselect config loses generic type info due to dynamic construction
const indices = result as number[];
```

**Effect type widening:**

```typescript
// Bad: cast the value
Effect.succeed(undefined as Settings | undefined);
Effect.succeed([] as string[]);

// Good: explicit type parameter
Effect.succeed<Settings | undefined>(undefined);
Effect.succeed<string[]>([]);
```

**JSON parsing - always validate:**

```typescript
// Bad: cast without validation
const data = JSON.parse(content) as Config;

// Good: Schema validation
const json = JSON.parse(content) as unknown;
const data =
  yield *
  Schema.decodeUnknown(ConfigSchema)(json).pipe(
    Effect.mapError((e) => new ParseError({ message: e.message })),
  );
```

## Project Structure

```
packages/           # All packages live here
  cli/              # @agentxm/cli - Thin CLI layer (yargs parsing, Effect handler wiring)
    e2e/              # End-to-end tests
      init.test.ts
    src/
      commands/
        <command>/
          <subcommand>/
            handler.ts
            handler.test.ts
          utils.ts  # Shared within this command module
      utils/        # Shared across cli modules
  core/             # @agentxm/core - Domain logic, types, and utilities (no CLI concerns)
    src/
      experimental/   # All code lives here (no barrel file; @experimental TSDoc required)
        <feature>.ts            # Single-file modules
        <feature>/              # Feature folders (barrel file allowed)
          index.ts
          <submodule>.ts
        <lib>-effect/           # Effect-wrapped third-party libraries
          index.ts
          errors.ts
openspec/           # Spec-driven development
  specs/            # Implemented capabilities
    <capability>/
    <capability>-<sub>/
    <capability>-<sub>-<subsub>/
  changes/          # Proposed changes
```

## Spec-Driven Development

User/API behavior is specified before implementation. Specs define _what_, designs define _how_.

- [ ] `specs.md` — User-facing behavior and API contracts only
      → No technical details, architecture, or implementation guidance
- [ ] `design.md` — Technical approach and implementation guidance
      → Architecture decisions, data structures, algorithms, patterns
- [ ] Always create both `specs.md` and `design.md` for proposals

## Git Workflow

**NEVER commit without explicit user request.** This is a hard rule with no exceptions.

- Do NOT commit after completing work
- Do NOT commit when tests pass
- Do NOT commit as part of a task workflow
- ONLY commit when the user explicitly asks (e.g., "commit", "/commit", "make a commit")

Wait for the user to review changes and decide when to commit.
