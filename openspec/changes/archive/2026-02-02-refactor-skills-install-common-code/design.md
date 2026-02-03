## Context

The `skills install` handler is the first fully implemented command in the AXM CLI. It contains ~1100 lines with embedded utility functions for:

- AXM directory path resolution
- Source URL building
- Effect-wrapped interactive prompts
- Spinner/progress output helpers
- Extension reference selection logic

These utilities are not specific to `skills install`—they will be needed by:

- Other skill commands: `update`, `enable`, `disable`, `remove`
- Other extension types: `commands`, `mcps`, `packs` (each with similar install/update/etc. commands)

Current state: All utilities live inline in `handler.ts`. No shared utility modules exist yet in the CLI package beyond `errors.ts` and `tty.ts`.

## Goals / Non-Goals

**Goals:**

- Extract reusable utilities before implementing additional commands
- Establish clear module boundaries between core (domain logic) and CLI (user interaction)
- Reduce handler complexity to focus on orchestration
- Create patterns that scale to other extension types

**Non-Goals:**

- Changing any user-facing behavior
- Generalizing for extension types not yet implemented (premature abstraction)
- Creating a full prompt/UI framework (just extract what exists)

## Decisions

### 1. Path utilities go in `core/experimental/paths.ts`

**Decision:** Create a new `paths` module in core for `getAxmDir()`, `getProjectDir()`, `getGlobalDir()`.

**Rationale:** These are domain concepts (where AXM stores data), not CLI concerns. Core modules like `settings.ts` and `lockfile.ts` already need path resolution but currently receive paths as parameters. Centralizing path logic in core enables consistent behavior.

**Alternatives considered:**

- Keep in CLI utils → Rejected: Other packages may need path resolution
- Add to existing `settings.ts` → Rejected: Paths are orthogonal to settings logic

### 2. Source URL builders stay with source-parser

**Decision:** Move `buildCloneUrl()` and `getOriginFromParsed()` into `core/experimental/skills/source-parser.ts`.

**Rationale:** These functions are the inverse of `parseSource()`—they convert a `ParsedSource` back to URLs. Collocating them maintains cohesion.

**Alternatives considered:**

- New `source-utils.ts` module → Rejected: Adds indirection for closely related functions
- Keep in handler → Rejected: Every extension type install will need these

### 3. Spinner helper in `cli/src/utils/spinner.ts`

**Decision:** Extract `createSpinnerHelper()` that returns `{ start, stop }` methods, automatically falling back to plain logs when stdout is not a TTY.

**Rationale:** Every command with async operations needs this pattern. The helper encapsulates TTY detection.

**Signature:**

```typescript
interface SpinnerHelper {
  start(message: string): void;
  stop(message: string): void;
}

function createSpinnerHelper(): SpinnerHelper;
```

### 4. Generic prompt wrappers in `cli/src/utils/prompts.ts`

**Decision:** Create Effect-wrapped versions of @clack/prompts that handle cancellation uniformly.

**Functions:**

```typescript
// Generic multiselect with Effect error handling
function promptMultiselect<T>(
  message: string,
  items: readonly T[],
  options: {
    toOption: (item: T) => { value: string; label: string; hint?: string };
    initialValues?: string[];
    required?: boolean;
  },
): Effect.Effect<T[], PromptError>;

// Generic single select
function promptSelect<T>(
  message: string,
  items: readonly T[],
  toOption: (item: T) => { value: string; label: string; hint?: string },
): Effect.Effect<T, PromptError>;

// Simple confirm
function promptConfirm(
  message: string,
  initialValue?: boolean,
): Effect.Effect<boolean, PromptError>;

// Check if prompts are available
function canPrompt(args: { yes?: boolean; nonInteractive?: boolean }): boolean;
```

**Rationale:** Current code has 4 nearly-identical prompt wrappers. Generic versions reduce duplication and ensure consistent cancellation handling (`process.exit(0)` on cancel).

**Alternatives considered:**

- Keep specialized wrappers per use case → Rejected: 90% identical code
- Use @clack/prompts directly → Rejected: Need Effect wrapping and consistent cancel handling

### 5. Extension ref selection in `cli/src/commands/skills/utils.ts`

**Decision:** Extract `selectExtensionRef()` to a skills-specific utils module, not global CLI utils.

**Rationale:** This function handles skill-specific UX (resolution results → user selection). While the pattern may generalize to other extension types, extracting to skills-specific utils avoids premature generalization. Can be promoted to shared utils later if needed.

**Signature:**

```typescript
function selectExtensionRef(
  refs: readonly ExtensionRef[],
  input: string,
  canPrompt: boolean,
): Effect.Effect<ExtensionRef, InstallError>;
```

### 6. Error formatting enhancement in existing `cli/src/utils/errors.ts`

**Decision:** Add `formatEmptyResolutionError()` to the existing errors module.

**Rationale:** This is CLI error formatting, fits with existing `formatError()`. Resolution errors will be needed by all extension type commands.

## Risks / Trade-offs

| Risk                                         | Mitigation                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Over-extraction makes code harder to follow  | Keep handler as the authoritative orchestration point; utilities are helpers, not frameworks |
| Prompt generics may not fit all future cases | Start with current use cases; extend signature if needed later                               |
| Module proliferation (many small files)      | Accept this trade-off; small focused modules are easier to test and maintain                 |
| Breaking existing tests                      | Run full test suite after each extraction; tests should pass unchanged                       |

## Migration Plan

1. **Phase 1: Core extractions** (no handler changes yet)
   - Create `core/experimental/paths.ts` with path functions
   - Add `buildCloneUrl()`, `getOriginFromParsed()` to source-parser
   - Add tests for new functions

2. **Phase 2: CLI utility extractions** (no handler changes yet)
   - Create `cli/src/utils/spinner.ts`
   - Create `cli/src/utils/prompts.ts`
   - Add `formatEmptyResolutionError()` to errors.ts
   - Create `cli/src/commands/skills/utils.ts`
   - Add tests for new utilities

3. **Phase 3: Handler migration**
   - Update handler imports to use extracted utilities
   - Remove inline utility implementations
   - Verify all tests pass

4. **Phase 4: Cleanup**
   - Remove any dead code
   - Update barrel exports in core and cli packages

## Open Questions

1. **PromptError type**: Should we create a dedicated `PromptError` tagged error, or reuse a generic `CliError`? Leaning toward dedicated type for better error handling.

2. **Spinner async behavior**: Current spinner helper is synchronous. Should `start`/`stop` return Effects for consistency, or keep them synchronous for simplicity?
