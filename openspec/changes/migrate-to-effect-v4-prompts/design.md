## Context

The CLI spike currently uses the `CliPrompt` service from `@axm.sh/core` for all interactive prompts. This service wraps `@clack/prompts` with a token-mapping layer, cancel-symbol translation, and non-interactive guards. Effect v4 now provides a native `Prompt` module (`effect/unstable/cli/Prompt`) that is fully effectful, composable, and built on the same service infrastructure the spike already uses (`Terminal`, `FileSystem`, `Path`).

This design covers migrating the spike to use Effect v4 prompts directly, building a small complementary prompt module for missing types, re-theming all demos to the pet store domain, and adding new demo commands for Effect v4-only prompt types.

### Current State

| Component | Status | Location |
|---|---|---|
| CliPrompt service | Retained (out of scope) | `packages/core/src/unstable/cli-prompt/` |
| Prompt demo commands (10) | Migrate | `packages/cli-spike/src/root/prompts/*.ts` |
| Pet store commands (2) | Migrate | `packages/cli-spike/src/root/pets/{adopt,intake}.ts` |
| Spike runtime | Modify error union + layers | `packages/cli-spike/src/runtime.ts` |
| Prompt helpers (`fromFlagOrPrompt`, `autoConfirm`) | Deprecate; replace with `AxmPrompt.unless`, `AxmPrompt.autoConfirm` | `packages/core/src/unstable/cli-prompt/helpers.ts` |

### Goals

1. Spike uses Effect v4 `Prompt` directly — no `CliPrompt` service dependency
2. All prompt demos use pet store domain for cohesive narrative
3. New demos showcase Effect v4-only capabilities (integer, date, toggle, list, hidden, composition)
4. Custom prompts for gaps (selectKey, groupMultiselect, autocompleteMultiselect) live in core under `AxmPrompt` namespace, built on `Prompt.custom`, with tests
5. Non-interactive mode works identically to today
6. Documentation shows both patterns (Effect v4 for spike, CliPrompt for primary CLI)

### Non-Goals

- Modifying existing `CliPrompt` service, Clack wrappers, or existing `@axm.sh/core` prompt code
- Migrating the primary CLI (`packages/cli/`)
- Building a reusable prompt abstraction layer — the spike uses prompts directly

## Decisions

### 1. Direct `yield* Prompt.xxx()`, no wrapper service

`Prompt<A>` extends `Effect.Yieldable`, so prompts are yielded directly inside `Effect.gen` — no `Prompt.run()` call needed.

**Why not a service?** The CliPrompt service exists to abstract over Clack's quirks (cancel symbols, token mapping, sync validation). Effect v4 prompts don't have those quirks — they return typed Effects, use `QuitError` for cancellation, and support effectful validation natively. A service wrapper would add indirection without value.

**Pattern:**

```typescript
// Before (CliPrompt)
const prompt = yield* CliPrompt;
const name = yield* prompt.text({ message: "Pet name:" });

// After (Effect v4 — Prompt is Yieldable)
const name = yield* Prompt.text({ message: "Pet name:" });
```

Prompts require `Terminal.Terminal` (+ `FileSystem`, `Path` for file prompts) in the environment, which the runtime layer provides. `Prompt.run()` exists as an escape hatch for use outside `Effect.gen` but is not needed in handlers.

### 2. Prompt helpers on the AxmPrompt namespace, dual/pipeable

The existing `fromFlagOrPrompt` and `autoConfirm` in `@axm.sh/core` are plain functions typed to `PromptCancelled | AppError`. They aren't pipeable and don't follow Effect's `dual` convention. We replace them with idiomatic helpers on the `AxmPrompt` namespace.

**Why core, not spike-local?** These helpers will be reused when the main CLI migrates to Effect v4 prompts. Putting them in core now avoids a second migration.

**Design:** Each helper uses `Function.dual` with the prompt as `self`, so it works both data-first (direct call) and data-last (pipe). This follows the same pattern as `Prompt.map` and `Prompt.flatMap`.

#### `AxmPrompt.unless`

Skips the prompt if a flag value was already provided. Prompt is `self`.

```typescript
export const unless: {
  // data-last (pipe)
  <A>(value: Option.Option<A>): (self: Prompt.Prompt<A>) => Effect.Effect<A, Terminal.QuitError, Prompt.Environment>
  // data-first (direct call)
  <A>(self: Prompt.Prompt<A>, value: Option.Option<A>): Effect.Effect<A, Terminal.QuitError, Prompt.Environment>
} = dual(2, <A>(self: Prompt.Prompt<A>, value: Option.Option<A>) =>
  Option.match(value, {
    onNone: () => self,  // Prompt is Yieldable — returned as-is
    onSome: Effect.succeed,
  }));
```

```typescript
// Pipe style — reads as "text prompt, unless already provided"
const name = yield* Prompt.text({ message: "Pet name:" }).pipe(
  AxmPrompt.unless(args.name),
)

// Direct call style
const name = yield* AxmPrompt.unless(
  Prompt.text({ message: "Pet name:" }),
  args.name,
)
```

#### `AxmPrompt.autoConfirm`

Skips the confirm prompt if `--yes` was passed. Prompt is `self`.

```typescript
export const autoConfirm: {
  (yes: boolean): (self: Prompt.Prompt<boolean>) => Effect.Effect<boolean, Terminal.QuitError, Prompt.Environment>
  (self: Prompt.Prompt<boolean>, yes: boolean): Effect.Effect<boolean, Terminal.QuitError, Prompt.Environment>
} = dual(2, (self: Prompt.Prompt<boolean>, yes: boolean) =>
  yes ? Effect.succeed(true) : self);
```

```typescript
// Pipe style — reads as "confirm prompt, auto-confirmed if --yes"
const ok = yield* Prompt.confirm({ message: "Proceed with intake?" }).pipe(
  AxmPrompt.autoConfirm(args.yes),
)

// Direct call style
const ok = yield* AxmPrompt.autoConfirm(
  Prompt.confirm({ message: "Proceed with intake?" }),
  args.yes,
)
```

#### Migration from existing helpers

The old helpers in `cli-prompt/helpers.ts` (`fromFlagOrPrompt`, `autoConfirm`) are deprecated but retained for the main CLI until it migrates to Effect v4 prompts. The new helpers live on `AxmPrompt` and accept `Prompt<T>` directly — no thunk wrapper needed.

| Old (CliPrompt) | New (AxmPrompt) |
|---|---|
| `fromFlagOrPrompt(value, () => prompt.text(...))` | `Prompt.text(...).pipe(AxmPrompt.unless(value))` |
| `autoConfirm(yes, () => prompt.confirm(...))` | `Prompt.confirm(...).pipe(AxmPrompt.autoConfirm(yes))` |

#### Non-interactive guard pattern

For commands that need to fail cleanly in non-interactive mode when no flag is provided, the handler checks `isNonInteractive` before yielding:

```typescript
const name = Option.isSome(args.name)
  ? args.name.value
  : nonInteractive
    ? yield* makeAppError({ code: "PROMPT_REQUIRED", ... })
    : yield* Prompt.text({ message: "Pet name:" });
```

This is equivalent to the existing `guardedPrompt` behavior but explicit at the call site rather than hidden inside the service layer.

### 3. QuitError replaces PromptCancelled in the spike error union

Effect v4 prompts fail with `Terminal.QuitError` when the user presses Ctrl+C. The spike runtime's `withRuntime` function changes its accepted error union:

```typescript
// Before
<A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>)

// After
<A, R>(program: Effect.Effect<A, AppError | Terminal.QuitError, R>)
```

The `withCliErrorHandling` function in core already handles `PromptCancelled` by exiting with code 0 and no error message. The spike's error handling needs to treat `QuitError` the same way. Two options:

**a) Map QuitError → PromptCancelled before passing to `withCliErrorHandling`:**

```typescript
const handled = provided.pipe(
  Effect.catchTag("QuitError", () => new PromptCancelled({ message: "Operation cancelled." })),
);
return yield* withCliErrorHandling(handled, { ... });
```

**b) Handle QuitError directly in the spike runtime, bypass `withCliErrorHandling` for it:**

```typescript
const handled = provided.pipe(
  Effect.catchTag("QuitError", () => Effect.void),
);
return yield* withCliErrorHandling(handled, { ... });
```

**Decision: (a)** — Map `QuitError` to `PromptCancelled`. This reuses the existing error handling path and its telemetry/cleanup logic without forking behavior. The mapping is a one-liner at the runtime boundary.

### 4. Custom prompt module for gap-filling types

Three prompt types the spike needs have no Effect v4 equivalent: `selectKey`, `groupMultiselect`, and `autocompleteMultiselect`. These are built using `Prompt.custom()` and live in core so the main CLI can reuse them after its own migration.

**Location:** `packages/core/src/unstable/cli/prompt/`

```
packages/core/src/unstable/cli/prompt/
  index.ts                       # barrel — AxmPrompt namespace export
  helpers.ts                     # unless, autoConfirm (dual/pipeable)
  select-key.ts                  # single-keypress selection
  group-multiselect.ts           # grouped multi-select
  autocomplete-multiselect.ts    # searchable multi-select
```

Exported from `@axm.sh/core/unstable/cli/prompt` as a namespace:

```typescript
import { AxmPrompt } from "@axm.sh/core/unstable/cli/prompt"
import { Prompt } from "effect/unstable/cli"

// Native prompts — Prompt namespace
const name = yield* Prompt.text({ message: "Pet name:" })

// Custom prompts — AxmPrompt namespace (same shape, distinct provenance)
const action = yield* AxmPrompt.selectKey({ message: "Quick action:", choices })
```

The `AxmPrompt` namespace keeps call sites visually consistent with `Prompt.xxx(...)` while making it clear which prompts are ours vs native Effect.

#### Design principles

1. **Same shape as native prompts.** Each constructor returns `Prompt<A>`, accepts a readonly options object, and is composable via `Prompt.all`, `Prompt.map`, `Prompt.flatMap`.
2. **`Prompt.custom` is the only build primitive.** No direct terminal I/O outside the `Prompt.custom` render loop.
3. **Options mirror native conventions.** `message`, `choices`, `maxPerPage`, `validate` follow the same naming, types, and defaults as `Prompt.select` / `Prompt.multiSelect` / `Prompt.autoComplete`.
4. **ANSI via Effect internals.** Rendering uses `effect/unstable/cli/internal/ansi` for styling and `Prompt.platformFigures` for platform-aware glyphs — same as native prompts.

#### `Prompt.custom` contract (reference)

```typescript
Prompt.custom<State, Output>(
  initialState: State | Effect<State, never, Prompt.Environment>,
  handlers: {
    render:  (state: State, action: Action<State, Output>) => Effect<string, never, Prompt.Environment>
    process: (input: Terminal.UserInput, state: State)      => Effect<Action<State, Output>, never, Prompt.Environment>
    clear:   (state: State, action: Action<State, Output>) => Effect<string, never, Prompt.Environment>
  }
): Prompt<Output>
```

The render loop: render → wait for input → process → Beep (re-render) / NextFrame (clear + re-render with new state) / Submit (clear + return value).

#### selectKey

Single-keypress selection — user presses a key matching one of the choices. No arrow navigation, no cursor movement. Ideal for quick-action menus.

```typescript
import type { Prompt } from "effect/unstable/cli";

export interface SelectKeyChoice<A> {
  readonly key: string;           // single character the user presses
  readonly title: string;         // display label
  readonly value: A;              // returned value
  readonly description?: string;  // optional hint shown beside the choice
}

export interface SelectKeyOptions<A> {
  readonly message: string;
  readonly choices: ReadonlyArray<SelectKeyChoice<A>>;
  readonly caseSensitive?: boolean; // default: false
}

export const selectKey: <const A>(options: SelectKeyOptions<A>) => Prompt.Prompt<A>;
```

**State:** `{ readonly error: Option<string> }`

**Process:** Compare `input.key.name` (lowercased unless `caseSensitive`) against `choice.key`. Match → `Action.Submit({ value })`. No match → `Action.NextFrame({ state: { error: Option.some("Invalid key") } })`.

**Render:** Message line + one line per choice formatted as `  key) title — description`. Error line (if any) rendered in red italic below choices.

**Example usage:**

```typescript
const action = yield* AxmPrompt.selectKey({
  message: "Quick action:",
  choices: [
    { key: "a", title: "Adopt a pet",    value: "adopt" },
    { key: "i", title: "Intake a pet",   value: "intake" },
    { key: "l", title: "List all pets",  value: "list" },
    { key: "r", title: "Register owner", value: "register" },
  ],
});
```

#### groupMultiselect

Multi-select with visually grouped choices. Space to toggle, Enter to submit. Groups provide visual hierarchy without changing the flat output type.

```typescript
import type { Prompt } from "effect/unstable/cli";

export interface GroupMultiselectChoice<A> {
  readonly title: string;
  readonly value: A;
  readonly description?: string;
  readonly selected?: boolean;     // default: false
}

export interface GroupMultiselectGroup<A> {
  readonly label: string;
  readonly choices: ReadonlyArray<GroupMultiselectChoice<A>>;
  readonly selectableHeader?: boolean; // default: false — if true, selecting the group header toggles all children
}

export interface GroupMultiselectOptions<A> {
  readonly message: string;
  readonly groups: ReadonlyArray<GroupMultiselectGroup<A>>;
  readonly maxPerPage?: number;    // default: 10
  readonly min?: number;           // minimum selections required
  readonly max?: number;           // maximum selections allowed
  readonly validate?: (values: ReadonlyArray<A>) => Effect.Effect<ReadonlyArray<A>, string>;
}

export const groupMultiselect: <const A>(options: GroupMultiselectOptions<A>) => Prompt.Prompt<ReadonlyArray<A>>;
```

**State:** `{ readonly index: number; readonly selectedIndices: Set<number>; readonly error: Option<string> }`

Internally, groups are flattened into a single indexed list. Group headers occupy index positions but are rendered differently (bold, indented differently). When `selectableHeader` is true, toggling a header toggles all its children.

**Process:**
- `up` / `down` — move cursor (skip non-selectable headers unless `selectableHeader`)
- `space` — toggle current item (or all children if header)
- `enter` — validate min/max, submit if valid
- `a` — select all / deselect all toggle

**Render:** Message line, then for each group: header line (bold) + indented choice lines with `☐`/`☒` checkboxes. Active line highlighted with `>` cursor. Error line at bottom if validation fails.

**Example usage:**

```typescript
const services = yield* AxmPrompt.groupMultiselect({
  message: "Select veterinary services:",
  groups: [
    {
      label: "Medical",
      selectableHeader: true,
      choices: [
        { title: "Vaccination", value: "vaccination" },
        { title: "Microchipping", value: "microchip" },
        { title: "Spay/Neuter", value: "spay-neuter" },
      ],
    },
    {
      label: "Grooming",
      choices: [
        { title: "Bath & Brush", value: "bath" },
        { title: "Nail Trim", value: "nails" },
      ],
    },
    {
      label: "Training",
      choices: [
        { title: "Basic Obedience", value: "obedience" },
        { title: "Socialization", value: "socialization" },
      ],
    },
  ],
});
```

#### autocompleteMultiselect

Searchable multi-select. Type to filter the visible list, Space to toggle, Enter to submit. Combines `autoComplete`'s filter behavior with `multiSelect`'s toggle behavior.

```typescript
import type { Prompt } from "effect/unstable/cli";

export interface AutocompleteMultiselectOptions<A> {
  readonly message: string;
  readonly choices: ReadonlyArray<Prompt.SelectChoice<A>>; // reuses native SelectChoice type
  readonly maxPerPage?: number;         // default: 10
  readonly min?: number;                // minimum selections required
  readonly max?: number;                // maximum selections allowed
  readonly filterLabel?: string;        // default: "filter"
  readonly filterPlaceholder?: string;  // default: "type to filter"
  readonly emptyMessage?: string;       // default: "No matches"
  readonly validate?: (values: ReadonlyArray<A>) => Effect.Effect<ReadonlyArray<A>, string>;
}

export const autocompleteMultiselect: <const A>(options: AutocompleteMultiselectOptions<A>) => Prompt.Prompt<ReadonlyArray<A>>;
```

**State:** `{ readonly query: string; readonly index: number; readonly selectedIndices: Set<number>; readonly filtered: ReadonlyArray<number>; readonly error: Option<string> }`

**Key behavior:** Selected items persist even when filtered out of view. The filter input and choice list are displayed together — typing narrows the list, arrow keys navigate, space toggles.

**Process:**
- printable characters — append to query, re-filter, reset index to 0
- `backspace` — trim query, re-filter
- `up` / `down` — navigate filtered list
- `space` — toggle selection of focused filtered item
- `enter` — validate min/max, submit all selected (not just visible)

**Render:** Message line + filter input (`filter: query▌`) + filtered choice lines with `☐`/`☒` + selection count (`N selected`). Empty state shows `emptyMessage`.

**Example usage:**

```typescript
const vetServices = yield* AxmPrompt.autocompleteMultiselect({
  message: "Select veterinary services:",
  choices: [
    { title: "Vaccination", value: "vaccination" },
    { title: "Microchipping", value: "microchip" },
    { title: "Dental Cleaning", value: "dental" },
    { title: "Blood Work", value: "bloodwork" },
    { title: "X-Ray", value: "xray" },
    { title: "Flea Treatment", value: "flea" },
    { title: "Deworming", value: "deworm" },
  ],
  min: 1,
});
```

#### Composability

All three custom prompts return `Prompt<A>`, so they compose with native prompts seamlessly:

```typescript
// With Prompt.all — runs selectKey then groupMultiselect sequentially
const { action, services } = yield* Prompt.all({
  action: AxmPrompt.selectKey({ message: "Quick action:", choices: actionChoices }),
  services: AxmPrompt.groupMultiselect({ message: "Services:", groups: serviceGroups }),
});

// With Prompt.flatMap — conditional follow-up
const result = AxmPrompt.selectKey({ message: "Action:", choices }).pipe(
  Prompt.flatMap((action) =>
    action === "adopt"
      ? Prompt.text({ message: "Adopter name:" })
      : Prompt.succeed("N/A")
  ),
);

// With AxmPrompt.unless — flag bypass (pipe style)
const species = yield* AxmPrompt.selectKey({ message: "Species:", choices: speciesChoices }).pipe(
  AxmPrompt.unless(args.species),
);
```

### 5. Pet store domain theming for all demos

All prompt demos are re-themed to use the pet store domain. The fake-pet-store data model already provides species, habitats, adoption, and intake concepts.

| Demo | Current Theme | Pet Store Theme |
|---|---|---|
| text | "Enter some text" | "Enter pet name:" |
| password | "Enter your secret" | "Enter admin authorization code:" |
| confirm | "Do you want to continue?" | "Confirm pet intake?" |
| select | Colors (red/green/blue) | Species (cat/dog/rabbit/bird/hamster) |
| multiselect | Fruits | Pet care requirements (vaccination, microchip, spay/neuter, flea treatment, deworming) |
| path | Generic file path | "Select pet records directory:" |
| autocomplete | Timezones | Pet names from catalog (searchable) |
| autocomplete-multiselect | npm packages | Available veterinary services |
| group-multiselect | Files/Network groups | Services grouped by category (Medical, Grooming, Training) |
| select-key | Generic options | Quick actions (a=Adopt, i=Intake, l=List, r=Register) |

New demo commands:

| Demo | Pet Store Scenario |
|---|---|
| integer | "Pet age in months:" (min: 1, max: 360) |
| date | "Intake date:" (defaults to today) |
| toggle | "Adoptable?" (on/off) |
| list | "Pet tags (comma-separated):" (e.g., "friendly,house-trained,good-with-kids") |
| hidden | "Admin override code:" (silent input) |
| composition | "Register pet" wizard — `Prompt.all({ name: text, species: select, age: integer, adoptable: toggle })` chained with `Prompt.flatMap` for conditional follow-up (if adoptable → select habitat) |

### 6. Runtime layer changes

The spike's `withRuntime` currently gets `CliPrompt` from `makeFoundationLayer`. After migration, the spike still needs `Terminal.Terminal`, `FileSystem`, and `Path` for prompts to work (since `Prompt<A>` carries `Environment = FileSystem | Path | Terminal` in its requirements).

**These are already provided** by `makeFoundationLayer` (which provides the full platform service set). No layer changes are needed beyond the error union update in Decision 3.

The spike continues to use `makeFoundationLayer` for `CliRenderer`, `Terminal`, `FileSystem`, `Path`, telemetry, and other foundation services. Only the `CliPrompt` service becomes unused (but is still provided — it's harmless and will be consumed by other dependents of the foundation layer).

### 7. Validation model migration

CliPrompt uses synchronous validation: `(value: string | undefined) => string | Error | undefined`. Effect v4 uses effectful validation: `(value: T) => Effect<T, string>`.

**Migration pattern:**

```typescript
// Before (sync, undefined = valid)
const validateTextValue = (value: string | undefined): string | undefined =>
  value === undefined || value.length < 1 ? "Input must be at least 1 character" : undefined;

// After (effectful, succeed = valid, fail = error message)
const validateTextValue = (value: string) =>
  value.length < 1
    ? Effect.fail("Input must be at least 1 character")
    : Effect.succeed(value);
```

Effectful validation is strictly more powerful — it can do async checks (e.g., verify pet name doesn't already exist) — but for the spike demos, the migration is mechanical.

### 8. Password returns Redacted

Effect v4's `Prompt.password` returns `Redacted.Redacted` instead of `string`. This prevents accidental logging of secrets.

**At call sites:**

```typescript
const code = yield* Prompt.password({ message: "Admin code:" });
// code is Redacted.Redacted — unwrap only when needed
const plaintext = Redacted.value(code);
```

The spike demos that show the entered value (e.g., `renderer.success("You entered: ...")`) will call `Redacted.value()` at the display point. This is intentional for demos; production code would avoid unwrapping.

### 9. Command tree structure

The `prompts` parent command gains 6 new subcommands. Updated tree:

```
axm-spike prompts
  ├── text              # (migrated) Pet name input
  ├── password          # (migrated) Admin auth code
  ├── hidden            # (new) Silent admin override
  ├── confirm           # (migrated) Pet intake confirmation
  ├── toggle            # (new) Adoptable on/off
  ├── integer           # (new) Pet age in months
  ├── date              # (new) Intake date picker
  ├── list              # (new) Pet tags
  ├── select            # (migrated) Species selection
  ├── multiselect       # (migrated) Care requirements
  ├── group-multiselect # (migrated) Grouped services
  ├── select-key        # (migrated) Quick actions
  ├── autocomplete      # (migrated) Pet name search
  ├── autocomplete-multiselect # (migrated) Vet services
  ├── path              # (migrated) Records directory
  └── composition       # (new) Register pet wizard
```

### 10. Documentation updates

**`contributing/guides/cli-design.md`** — Add a section titled "Effect v4 Native Prompts (CLI Spike)" alongside the existing CliPrompt guidance. Show:
- `yield* Prompt.text(...)` pattern (Prompt is Yieldable)
- Non-interactive guard pattern (explicit `isNonInteractive` check)
- `Prompt.all` composition for multi-field forms
- `Prompt.custom` for building new prompt types
- Note that CliPrompt remains canonical for the primary CLI

**`.claude/skills/cli-conventions/SKILL.md`** — Add examples showing both approaches with a note that the spike uses Effect v4 prompts directly while the primary CLI uses CliPrompt.

## File Change Summary

| File | Change |
|---|---|
| `packages/cli-spike/src/runtime.ts` | Error union `AppError \| QuitError`, map QuitError → PromptCancelled |
| `packages/core/src/unstable/cli-prompt/helpers.ts` | Deprecate old helpers (retained for main CLI until migration) |
| `packages/core/src/unstable/cli/prompt/index.ts` | New: `AxmPrompt` namespace — barrel exports custom prompts + helpers |
| `packages/core/src/unstable/cli/prompt/helpers.ts` | New: `unless` and `autoConfirm` as `dual(2)` pipeable helpers |
| `packages/core/src/unstable/cli/prompt/select-key.ts` | New: `Prompt.custom`-based selectKey |
| `packages/core/src/unstable/cli/prompt/select-key.test.ts` | New: selectKey tests |
| `packages/core/src/unstable/cli/prompt/group-multiselect.ts` | New: `Prompt.custom`-based groupMultiselect |
| `packages/core/src/unstable/cli/prompt/group-multiselect.test.ts` | New: groupMultiselect tests |
| `packages/core/src/unstable/cli/prompt/autocomplete-multiselect.ts` | New: `Prompt.custom`-based autocompleteMultiselect |
| `packages/core/src/unstable/cli/prompt/autocomplete-multiselect.test.ts` | New: autocompleteMultiselect tests |
| `packages/core/src/unstable/cli/prompt/helpers.test.ts` | New: unless and autoConfirm tests |
| `packages/cli-spike/src/root/prompts/text.ts` | Migrate to Prompt.text, pet store theme |
| `packages/cli-spike/src/root/prompts/password.ts` | Migrate to Prompt.password (Redacted), pet store theme |
| `packages/cli-spike/src/root/prompts/confirm.ts` | Migrate to Prompt.confirm, pet store theme |
| `packages/cli-spike/src/root/prompts/select.ts` | Migrate to Prompt.select, pet store theme |
| `packages/cli-spike/src/root/prompts/multiselect.ts` | Migrate to Prompt.multiSelect, pet store theme |
| `packages/cli-spike/src/root/prompts/group-multiselect.ts` | Migrate to custom groupMultiselect, pet store theme |
| `packages/cli-spike/src/root/prompts/select-key.ts` | Migrate to custom selectKey, pet store theme |
| `packages/cli-spike/src/root/prompts/autocomplete.ts` | Migrate to Prompt.autoComplete, pet store theme |
| `packages/cli-spike/src/root/prompts/autocomplete-multiselect.ts` | Migrate to custom autocompleteMultiselect, pet store theme |
| `packages/cli-spike/src/root/prompts/path.ts` | Migrate to Prompt.file, pet store theme |
| `packages/cli-spike/src/root/prompts/integer.ts` | New: Prompt.integer demo |
| `packages/cli-spike/src/root/prompts/date.ts` | New: Prompt.date demo |
| `packages/cli-spike/src/root/prompts/toggle.ts` | New: Prompt.toggle demo |
| `packages/cli-spike/src/root/prompts/list.ts` | New: Prompt.list demo |
| `packages/cli-spike/src/root/prompts/hidden.ts` | New: Prompt.hidden demo |
| `packages/cli-spike/src/root/prompts/composition.ts` | New: Prompt.all + flatMap demo |
| `packages/cli-spike/src/root/prompts/command.ts` | Add 6 new subcommands to parent |
| `packages/cli-spike/src/root/pets/adopt.ts` | Replace CliPrompt.confirm with Prompt.confirm |
| `packages/cli-spike/src/root/pets/intake.ts` | Replace CliPrompt.confirm with Prompt.confirm |
| `contributing/guides/cli-design.md` | Add Effect v4 prompt section |
| `.claude/skills/cli-conventions/SKILL.md` | Add Effect v4 prompt examples |
