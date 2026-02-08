## Context

The CLI uses `@clack/prompts` wrapped in an Effect service (`Clack` in `src/clack-effect/`). This service provides logging, prompts (confirm, select, multiselect), and spinners. It follows the standard pattern: interface → `Context.Tag` → live layer → test layer returning `[Layer, MockService]`.

We're introducing a new TUI module at `src/tui/` backed by Ink (React-based terminal renderer). This module will provide functionally equivalent capabilities to `clack-effect` plus new prompt types (text, password, group). The existing `clack-effect` module stays untouched — no consumers are migrated in this change.

**Constraints:**

- The project uses `verbatimModuleSyntax` and has no JSX support configured today
- Bun runtime (supports JSX natively at runtime, but TypeScript still needs config)
- All services follow the Effect service pattern established by `Clack`

## Goals / Non-Goals

**Goals:**

- Two new Effect services (`Tui` and `Prompts`) covering output and interactive input
- Ink-backed rendering for interactive prompts with proper raw mode / stdin handling
- Test layers with mock implementations and inspection (same pattern as `clack-effect/test.ts`)
- JSX support in the TypeScript config for `.tsx` component files

**Non-Goals:**

- Migrating existing `clack-effect` consumers to the new module
- Removing or modifying `clack-effect`
- Advanced TUI features (progress bars, tables, multi-step wizards) — those can come later
- Custom theming or color configuration

## Decisions

### 1. Module structure: `src/tui/` with `prompts/` sub-module

```
src/tui/
  index.ts              # Barrel: Tui, TuiLive, errors, types
  service.ts            # Tui service (log, intro, outro, spinner, note)
  types.ts              # Shared types (Spinner, NoteConfig)
  errors.ts             # TuiError
  test.ts               # makeTuiTestLayer, MockTuiService
  prompts/
    index.ts            # Barrel: Prompts, PromptsLive, errors, types
    service.ts          # Prompts service (text, password, confirm, select, multiselect, group)
    types.ts            # Prompt config types (TextConfig, SelectConfig, etc.)
    errors.ts           # PromptError, PromptCancelled
    test.ts             # makePromptsTestLayer, MockPromptsService
    components/         # Ink React components (.tsx)
      text-input.tsx
      password-input.tsx
      confirm.tsx
      select.tsx
      multiselect.tsx
```

**Rationale:** Matches the two capabilities (`tui`, `tui-prompts`). Output primitives (log, spinner) are separate from interactive prompts because they have different concerns — output is fire-and-forget, prompts block on user input with cancellation semantics. The `components/` directory holds Ink React components that are internal implementation details, not exported.

**Alternatives considered:**

- Single flat `src/tui/` module with one service — rejected because output and prompts have distinct error models and testing needs
- `src/prompts/` at top level — rejected per user direction to nest under `src/tui/`

### 2. Two Effect services: `Tui` and `Prompts`

```typescript
// src/tui/service.ts
export class Tui extends Context.Tag("@axm.sh/cli/Tui")<Tui, TuiService>() {}

// src/tui/prompts/service.ts
export class Prompts extends Context.Tag("@axm.sh/cli/Prompts")<Prompts, PromptsService>() {}
```

**`TuiService` interface:**

- `intro(title: string)` → `Effect<void>`
- `outro(message: string)` → `Effect<void>`
- `log.info/warn/error/success/message(msg: string)` → `Effect<void>`
- `spinner()` → `Effect<Spinner>`
- `note(message: string, title?: string)` → `Effect<void>`

**`PromptsService` interface:**

- `text(config: TextConfig)` → `Effect<string, PromptError | PromptCancelled>`
- `password(config: PasswordConfig)` → `Effect<string, PromptError | PromptCancelled>`
- `confirm(message: string, initialValue?: boolean)` → `Effect<boolean, PromptError | PromptCancelled>`
- `select<T>(config: SelectConfig<T>)` → `Effect<T, PromptError | PromptCancelled>`
- `multiselect<T>(config: MultiselectConfig<T>)` → `Effect<T[], PromptError | PromptCancelled>`
- `group<T>(prompts: GroupConfig<T>)` → `Effect<T, PromptError | PromptCancelled>`

**Rationale:** Mirrors the `Clack` service pattern. Two services allow handlers to depend on only what they need — a command that just logs output doesn't need to declare a `Prompts` dependency.

### 3. Ink for prompt rendering, direct stdout for output

Interactive prompts use Ink's render lifecycle:

```typescript
// Conceptual pattern for each prompt
const text = (config: TextConfig) =>
  Effect.async<string, PromptError | PromptCancelled>((resume) => {
    const instance = render(
      <TextPromptComponent
        config={config}
        onSubmit={(value) => {
          instance.unmount();
          resume(Effect.succeed(value));
        }}
        onCancel={() => {
          instance.unmount();
          resume(Effect.fail(new PromptCancelled({ message: "Operation cancelled." })));
        }}
      />
    );
  });
```

Output primitives (`log`, `intro`, `outro`, `note`) use direct stdout writes with ANSI formatting — they are write-once and don't benefit from Ink's re-rendering model. The spinner uses Ink since it requires animation.

**Alternatives considered:**

- Ink for everything (including logs) — rejected as unnecessary overhead for write-once output
- No Ink, raw ANSI for prompts — rejected because managing cursor, raw mode, and input handling manually is error-prone

### 4. Dependencies: `ink` + `react` + community input components

- `ink` — core renderer, `<Box>`, `<Text>`, `useInput`, `useApp`
- `react` — required peer dependency of Ink
- `ink-text-input` — controlled text input with cursor management (text and password prompts)
- `ink-select-input` — single select with keyboard navigation
- `ink-spinner` — animated spinner
- `ink-testing-library` — test renderer (dev dependency)

Build confirm and multiselect as custom components using `useInput` — they're simple enough to not need a library.

**Alternatives considered:**

- `ink-ui` (higher-level component library) — rejected because it bundles opinionated styling and we want control over appearance
- All custom components from scratch — rejected because text input cursor management and select scrolling are fiddly to get right

### 5. JSX support via `tsconfig`

Add to `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

This enables `.tsx` files project-wide. Only the `src/tui/prompts/components/` directory will contain `.tsx` files. The `react-jsx` transform avoids needing `import React from 'react'` in every file.

**Alternatives considered:**

- Separate `tsconfig` for the tui module — rejected as over-complicated; JSX config is harmless for non-JSX files
- `createElement` calls without JSX — rejected for readability

### 6. Error types: reuse the same model

```typescript
// src/tui/prompts/errors.ts
export class PromptError extends Data.TaggedError("PromptError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

export class PromptCancelled extends Data.TaggedError("PromptCancelled")<{
  readonly message: string;
}> {}

// src/tui/errors.ts
export class TuiError extends Data.TaggedError("TuiError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}
```

Same error shapes as `clack-effect` — `PromptCancelled` for user Ctrl+C/Escape, `PromptError` for unexpected failures. `TuiError` for output failures (rare but possible, e.g. broken pipe).

### 7. Test layer pattern: `[Layer, MockService]` tuple

Follows the established `makeClackTestLayer` pattern:

```typescript
export function makePromptsTestLayer(
  config?: MockPromptsConfig,
): [Layer.Layer<Prompts>, MockPromptsService] {
  const mock = makeMockPromptsService(config);
  return [Layer.succeed(Prompts, mock), mock];
}
```

Mock service records all calls and returns configurable behaviors (return value, cancel, error) — same approach as `clack-effect/test.ts`.

## Risks / Trade-offs

- **React dependency** — Ink requires React, adding ~130KB to node_modules. This is a development dependency cost only (Bun bundles at build time). → Acceptable trade-off for the component model benefits.

- **JSX in a non-React project** — Adding JSX support to tsconfig affects the whole project, though only `components/` will use `.tsx` files. → Low risk; JSX config is inert for `.ts` files.

- **Ink version churn** — Ink has had breaking changes between major versions (v3 → v4 → v5). → Pin to a specific major version. Components are internal, so Ink upgrades are contained to `src/tui/`.

- **Raw mode conflicts** — If multiple Ink instances render simultaneously, raw mode ref-counting could conflict. → Each prompt renders and unmounts before the next. The `group` prompt chains sequentially by design.

- **Testing Ink components** — `ink-testing-library` uses ANSI escape sequences for stdin simulation, which can be brittle. → Test prompts at two levels: unit test the Effect service layer with mocks (behavior), integration test Ink components with `ink-testing-library` (rendering).
