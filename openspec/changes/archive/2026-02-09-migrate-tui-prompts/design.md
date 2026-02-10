## Context

The Ink-based TUI services (`packages/cli/src/tui/`) were built as a replacement for the `clack-effect` wrapper around `@clack/prompts`. The TUI module provides modular, individually-testable Effect services (Log, Spinner, Confirm, Select, Multiselect, etc.) while the old clack-effect module bundles everything into a single monolithic `Clack` service.

Currently **8 production files** and **7 test files** consume `Clack`. The clack-effect module is the sole consumer of `@clack/prompts`.

## Goals / Non-Goals

**Goals:**

- Replace all `Clack` service usage with individual TUI services
- Remove `clack-effect/` module and `@clack/prompts` dependency
- Migrate all tests to modular TUI test layers
- Maintain identical user-visible behavior (same prompts, same messages)

**Non-Goals:**

- Changing prompt behavior, wording, or flow
- Adding new prompts or TUI features
- Refactoring handler logic beyond the service swap

## Decisions

### 1. Individual service imports vs. a unified facade

**Decision**: Import individual TUI services (`Log`, `Spinner`, `Confirm`, etc.) directly — no facade.

**Rationale**: The TUI module was designed to be modular. Each handler only uses a subset of services. Individual imports make dependencies explicit and enable finer-grained test layers. A facade would recreate the monolithic pattern we're leaving behind.

### 2. Intro/outro replacement

**Decision**: Replace `clack.intro(title)` with `Log.info(title)` and `clack.outro(message)` with `Log.success(message)`.

**Rationale**: Clack's intro/outro rendered decorative boxes. The TUI Log service doesn't have an equivalent, and adding one is out of scope. `Log.info` for the title and `Log.success` for the closing message preserves the semantic meaning. If richer intro/outro rendering is wanted later, a `Note` service call could be used, but that's a separate decision.

### 3. Spinner API adaptation

**Decision**: Adapt to TUI spinner's effectful API (`start` returns `Effect<SpinnerHandle>`, `stop` is effectful).

The clack spinner had a synchronous API:

```typescript
const spinner = yield * clack.spinner();
spinner.start("message"); // void
spinner.stop("done"); // void
```

The TUI spinner is effectful:

```typescript
const handle = yield * spinner.start("message"); // Effect<SpinnerHandle>
yield * handle.stop("done"); // Effect<void>
```

**Rationale**: The TUI spinner manages Ink component lifecycle (mount/unmount), requiring effectful operations. This is a mechanical API change with no behavioral difference.

### 4. Error type source

**Decision**: Import `PromptError` and `PromptCancelled` from `tui/errors.ts`.

**Rationale**: Both modules define identical error types. Switching the import source is sufficient — no error handling logic changes.

### 5. Runtime layer composition

**Decision**: Replace `ClackLive` with `TuiLive` in `AppLayer`.

```typescript
// Before
export const AppLayer = Layer.mergeAll(NodeContext.layer, FetchHttpClient.layer, ClackLive);

// After
export const AppLayer = Layer.mergeAll(NodeContext.layer, FetchHttpClient.layer, TuiLive);
```

**Rationale**: `TuiLive` merges all individual TUI live layers. Providing it at the runtime level means all handlers get TUI services without per-handler layer wiring. The `AppLayer` type changes from including `Clack` to including the individual TUI service tags.

### 6. Test migration pattern

**Decision**: Replace monolithic `makeClackTestLayer(config)` with composed individual test layers.

```typescript
// Before
const [layer, mock] = makeClackTestLayer({
  confirmBehavior: Option.some({ type: "return", value: true }),
  multiselectBehavior: Option.none(),
});

// After
const [confirmLayer, confirmMock] = makeConfirmTestLayer({ type: "return", value: true });
const [logLayer, logMock] = makeLogTestLayer();
const testLayer = Layer.mergeAll(confirmLayer, logLayer);
```

**Rationale**: Modular test layers match the modular service design. Each test only provides layers for the services it exercises, making dependencies explicit. Behaviors are passed directly (not wrapped in `Option`).

### 7. Workspace service type signatures

**Decision**: Replace `Clack` in type positions with the union of TUI services actually used.

The workspace `make` function and `layer` factory currently require `Clack` in their `R` type parameter. After migration, Effect's type inference will automatically compute the required services from usage. No explicit type annotations needed — let inference handle it.

**Rationale**: Effect's covariant R parameter tracks dependencies automatically. Explicit annotations would need updating every time a service is added/removed.

## Risks / Trade-offs

**[Risk] Subtle behavioral differences between clack and TUI prompts** → Both are tested against the same specs. The TUI services were built to match clack's behavior. Visual differences (styling, borders) are expected and acceptable.

**[Risk] Test layer composition verbosity** → Each test now creates multiple `[layer, mock]` tuples instead of one. This is more explicit but more verbose. Mitigated by the TUI module re-exporting all test factories from the barrel.

**[Risk] AppLayer type changes propagate** → Any code that references `AppLayer` as a type (e.g., the `run` function) needs updating. Mitigated by letting inference compute the type where possible.
