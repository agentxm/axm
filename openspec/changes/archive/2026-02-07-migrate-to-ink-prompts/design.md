## Context

The CLI uses `@clack/prompts` wrapped in an Effect service (`Clack` in `src/clack-effect/`). This service provides logging, prompts (confirm, select, multiselect), and spinners. It follows the standard pattern: interface → `Context.Tag` → live layer → test layer returning `[Layer, MockService]`.

We're introducing a new TUI module at `src/tui/` backed by Ink (React-based terminal renderer). This module will provide functionally equivalent capabilities to `clack-effect` plus new prompt types (text, password, group). The existing `clack-effect` module stays untouched — no consumers are migrated in this change.

**Constraints:**

- The project uses `verbatimModuleSyntax` and has no JSX support configured today
- Bun runtime (supports JSX natively at runtime, but TypeScript still needs config)
- All services follow the Effect service pattern established by `Clack`

## Goals / Non-Goals

**Goals:**

- Individual Effect services per TUI component (text-input, select, spinner, etc.)
- Ink-backed rendering for interactive prompts with proper raw mode / stdin handling
- Each component is a self-contained module with its own service, types, test layer, and Ink component
- JSX support in the TypeScript config for `.tsx` component files

**Non-Goals:**

- Migrating existing `clack-effect` consumers to the new module
- Removing or modifying `clack-effect`
- Advanced TUI features (progress bars, tables, multi-step wizards) — those can come later
- Custom theming or color configuration

## Decisions

### 1. Module structure: one sub-module per TUI component

```
src/tui/
  index.ts                # Barrel: re-exports all component public APIs
  errors.ts               # Shared errors (PromptCancelled)
  text-input/
    index.ts              # Barrel: TextInput, TextInputLive, types
    service.ts            # TextInput service + live layer
    types.ts              # TextInputConfig
    test.ts               # makeTextInputTestLayer
    component.tsx         # Ink React component
  password-input/
    index.ts
    service.ts            # PasswordInput service + live layer
    types.ts              # PasswordInputConfig
    test.ts
    component.tsx
  confirm/
    index.ts
    service.ts            # Confirm service + live layer
    types.ts              # ConfirmConfig
    test.ts
    component.tsx
  select/
    index.ts
    service.ts            # Select service + live layer
    types.ts              # SelectConfig, SelectOption
    test.ts
    component.tsx
  multiselect/
    index.ts
    service.ts            # Multiselect service + live layer
    types.ts              # MultiselectConfig
    test.ts
    component.tsx
  log/
    index.ts
    service.ts            # Log service + live layer (info, warn, error, success, message)
    test.ts
  spinner/
    index.ts
    service.ts            # Spinner service + live layer
    types.ts              # SpinnerHandle
    test.ts
    component.tsx
  note/
    index.ts
    service.ts            # Note service + live layer
    test.ts
```

Each component is a self-contained feature folder following the project's code organization principle. Handlers depend on exactly the services they need — a command that only shows a spinner doesn't pull in text-input.

**Rationale:** Granular services match Effect's compositional model. Each service has a small, focused interface. Test layers are simple — mock one thing at a time. Adding new TUI components later is just adding a new folder.

**Alternatives considered:**

- Monolithic `Tui` + `Prompts` services — rejected because a single large interface is harder to mock, test, and extend; handlers would depend on capabilities they don't use
- Flat files in `src/tui/` without sub-folders — rejected because each component has enough internal structure (service, types, test, component) to warrant its own folder

### 2. Service-per-component pattern

Each component defines its own Effect service with a focused interface:

```typescript
// src/tui/text-input/service.ts
interface TextInputService {
  readonly prompt: (config: TextInputConfig) => Effect<string, PromptError | PromptCancelled>;
}
export class TextInput extends Context.Tag("@axm.sh/cli/tui/TextInput")<
  TextInput,
  TextInputService
>() {}

// src/tui/select/service.ts
interface SelectService {
  readonly prompt: <T>(config: SelectConfig<T>) => Effect<T, PromptError | PromptCancelled>;
}
export class Select extends Context.Tag("@axm.sh/cli/tui/Select")<Select, SelectService>() {}

// src/tui/log/service.ts
interface LogService {
  readonly info: (message: string) => Effect<void>;
  readonly warn: (message: string) => Effect<void>;
  readonly error: (message: string) => Effect<void>;
  readonly success: (message: string) => Effect<void>;
  readonly message: (message: string) => Effect<void>;
}
export class Log extends Context.Tag("@axm.sh/cli/tui/Log")<Log, LogService>() {}

// src/tui/spinner/service.ts
interface SpinnerService {
  readonly start: (message: string) => Effect<SpinnerHandle>;
}
export class Spinner extends Context.Tag("@axm.sh/cli/tui/Spinner")<Spinner, SpinnerService>() {}
```

Handlers consume only what they need:

```typescript
const handler = Effect.gen(function* () {
  const log = yield* Log;
  const textInput = yield* TextInput;
  const select = yield* Select;

  yield* log.info("Starting setup...");
  const name = yield* textInput.prompt({ message: "Project name?" });
  const template = yield* select.prompt({ message: "Template?", items: [...] });
});
```

**Rationale:** Small services are easy to understand, mock, and compose. The Effect type system tracks exactly which TUI components a handler depends on.

### 3. Ink for interactive components, direct stdout for output

Interactive components (text-input, password-input, confirm, select, multiselect) use Ink's render lifecycle:

```typescript
// Conceptual pattern for each interactive prompt
const prompt = (config: TextInputConfig) =>
  Effect.async<string, PromptError | PromptCancelled>((resume) => {
    const instance = render(
      <TextInputComponent
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

Output components (`log`, `note`) use direct stdout writes with ANSI formatting — they are write-once and don't benefit from Ink's re-rendering model. The `spinner` uses Ink since it requires animation.

**Alternatives considered:**

- Ink for everything (including logs) — rejected as unnecessary overhead for write-once output
- No Ink, raw ANSI for prompts — rejected because managing cursor, raw mode, and input handling manually is error-prone

### 4. Dependencies: `ink` + `react` + community input components

- `ink` — core renderer, `<Box>`, `<Text>`, `useInput`, `useApp`
- `react` — required peer dependency of Ink
- `ink-text-input` — controlled text input with cursor management (text-input and password-input)
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

This enables `.tsx` files project-wide. Only `src/tui/*/component.tsx` files will use JSX. The `react-jsx` transform avoids needing `import React from 'react'` in every file.

**Alternatives considered:**

- Separate `tsconfig` for the tui module — rejected as over-complicated; JSX config is harmless for non-JSX files
- `createElement` calls without JSX — rejected for readability

### 6. Shared error types in `src/tui/errors.ts`

```typescript
// src/tui/errors.ts — shared across all interactive components
export class PromptError extends Data.TaggedError("PromptError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

export class PromptCancelled extends Data.TaggedError("PromptCancelled")<{
  readonly message: string;
}> {}
```

`PromptCancelled` and `PromptError` are shared because all interactive components have the same failure modes (user cancellation, unexpected rendering error). Individual components don't define their own error types — the shared errors are sufficient.

Output components (`log`, `note`) don't fail in normal operation, so they return `Effect<void>` with no error channel.

### 7. Test layer pattern: `[Layer, MockService]` per component

Each component provides its own test layer factory:

```typescript
// src/tui/text-input/test.ts
export function makeTextInputTestLayer(
  behavior?: TextInputBehavior,
): [Layer.Layer<TextInput>, MockTextInputService] {
  const mock = makeMockTextInputService(behavior);
  return [Layer.succeed(TextInput, mock), mock];
}
```

Handlers in tests compose only the layers they need:

```typescript
const [textInputLayer, textInputMock] = makeTextInputTestLayer({ value: "my-project" });
const [selectLayer, selectMock] = makeSelectTestLayer({ index: 0 });
const testLayer = Layer.mergeAll(textInputLayer, selectLayer, logTestLayer);
```

### 8. Dev entry point for interactive TUI testing

A separate entry point at `src/dev/tui.ts` (not included in the published `bin` field) provides interactive manual testing for each component via yargs sub-commands:

```
pnpm tui text-input       # interactive text input test
pnpm tui password-input   # masked input test
pnpm tui confirm           # yes/no test
pnpm tui select            # single select test
pnpm tui multiselect       # multi select test
pnpm tui spinner           # spinner animation test
pnpm tui log               # log output variants test
pnpm tui note              # boxed note test
```

```typescript
// src/dev/tui.ts — dev-only, not shipped
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .command("text-input", "Test text input component", {}, runTextInputDemo)
  .command("select", "Test select component", {}, runSelectDemo)
  // ...
  .demandCommand(1)
  .parse();
```

Add to `packages/cli/package.json`:

```json
{
  "scripts": {
    "tui": "bun src/dev/tui.ts"
  }
}
```

This is completely decoupled from the main CLI — no conditional logic, no dead code in the distributed binary. Each sub-command imports the live layer for its component directly and runs a demo interaction.

**Alternatives considered:**

- Conditional command registration via env var — rejected for unnecessary coupling to the main CLI
- Yargs `hidden: true` — rejected because the command still ships in the binary

## Risks / Trade-offs

- **Many small services** — More services means more imports and layer composition. → Effect's `Layer.mergeAll` makes this ergonomic. A convenience `TuiLive` layer that merges all live layers can be exported from `src/tui/index.ts` for handlers that need everything.

- **React dependency** — Ink requires React, adding ~130KB to node_modules. This is a development dependency cost only (Bun bundles at build time). → Acceptable trade-off for the component model benefits.

- **JSX in a non-React project** — Adding JSX support to tsconfig affects the whole project, though only `component.tsx` files will use JSX. → Low risk; JSX config is inert for `.ts` files.

- **Ink version churn** — Ink has had breaking changes between major versions. → Pin to a specific major version. Components are internal, so Ink upgrades are contained to `src/tui/`.

- **Raw mode conflicts** — If multiple Ink instances render simultaneously, raw mode ref-counting could conflict. → Each prompt renders and unmounts before the next.

- **Testing Ink components** — `ink-testing-library` uses ANSI escape sequences for stdin simulation, which can be brittle. → Test at two levels: unit test the Effect service layer with mocks (behavior), integration test Ink components with `ink-testing-library` (rendering).
