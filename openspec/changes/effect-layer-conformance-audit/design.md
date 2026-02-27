## Context

The `effect-service` and `effect-layers` skills now codify best practices for service definition, layer construction, naming, test layers, and composition. An audit of the 25 services and 14 live layers in `packages/cli/src/` reveals systematic non-conformance that predates these guidelines. All changes are structural — zero behavioral impact.

### Current State Summary

| Area                                     | Conformant | Non-conformant                                  |
| ---------------------------------------- | ---------- | ----------------------------------------------- |
| Tag identifiers (`@axm.sh/cli/` prefix)  | 13         | 12                                              |
| Interface pattern (combined tag default) | 12 inline  | 13 separate (none have multiple impls)          |
| Test layer naming (`*Test` suffix)       | 0          | 6 (`make*TestLayer` factories)                  |
| Test layer file naming (not `test.ts`)   | 0          | 6 (named `test.ts`, confusable with test files) |
| Test layer pattern (Ref-based state)     | 0          | 6 (`[Layer, Mock]` tuple)                       |
| `provide` helper typing (no `any`)       | 10         | 4 (`any` casts)                                 |

## Goals / Non-Goals

**Goals:**

- Align all 12 unqualified service tags to `@axm.sh/cli/<Name>` convention
- Convert 11 unnecessary explicit interfaces to combined tag pattern
- Replace `[Layer, Mock]` test layer factories with `*Test` naming and Ref-based state
- Rename test layer files from `test.ts` to co-located `*Test.ts` files
- Eliminate `any` casts in `provide` / `provideServices` helpers

**Non-Goals:**

- Refactoring the captured-dependency re-provision pattern itself — this is a valid approach documented in the `effect-layers` skill as "Approach B"
- Changing layer constructors (e.g., converting `Layer.succeed` to `Layer.effect`) — all current choices are appropriate
- Changing composition topology — the current edge-composition in `runtime/index.ts` and command handlers is correct
- Simplifying the `SkillManager` parameter-threading through helpers — that's a separate refactor

## Decisions

### D1: Tag identifier namespacing

**Decision:** Add `@axm.sh/cli/` prefix to all 12 unqualified tag identifiers. Use a flat namespace — the existing `@axm.sh/cli/clack-effect/` sub-namespace used by clack services is a pre-existing convention for that subsystem; new tags don't need sub-namespacing.

Affected tags:

- `SkillManager` → `@axm.sh/cli/SkillManager`
- `PackManager` → `@axm.sh/cli/PackManager`
- `CommandManager` → `@axm.sh/cli/CommandManager`
- `McpServerManager` → `@axm.sh/cli/McpServerManager`
- `InstallSkillCommandWorkflowActions` → `@axm.sh/cli/InstallSkillCommandWorkflowActions`
- `InstallPackCommandWorkflowActions` → `@axm.sh/cli/InstallPackCommandWorkflowActions`
- `InstallCommandCommandWorkflowActions` → `@axm.sh/cli/InstallCommandCommandWorkflowActions`
- `InstallMcpServerCommandWorkflowActions` → `@axm.sh/cli/InstallMcpServerCommandWorkflowActions`
- `UninstallSkillCommandWorkflowActions` → `@axm.sh/cli/UninstallSkillCommandWorkflowActions`
- `UninstallPackCommandWorkflowActions` → `@axm.sh/cli/UninstallPackCommandWorkflowActions`
- `UninstallCommandCommandWorkflowActions` → `@axm.sh/cli/UninstallCommandCommandWorkflowActions`
- `UninstallMcpServerCommandWorkflowActions` → `@axm.sh/cli/UninstallMcpServerCommandWorkflowActions`

**Rationale:** Tag strings are runtime identifiers used for debugging and error messages. Namespacing prevents collisions and makes traces greppable.

**Risk:** Tag strings are not serialized or persisted — change is purely internal.

### D2: Combined tag pattern for single-implementation services

**Decision:** Convert 11 services that use separate explicit interfaces to the combined tag + inline interface pattern.

Affected services:

- `ClackLog` + `ClackLogService` → combined
- `ClackSpinner` + `ClackSpinnerService` → combined
- `ClackPrompt` + `ClackPromptService` → combined
- `ClackProgress` + `ClackProgressService` → combined
- `ClackTaskLog` + `ClackTaskLogService` → combined
- `ClackStream` + `ClackStreamService` → combined
- `Confirm` + `ConfirmService` → combined
- `Select` + `SelectService` → combined
- `Multiselect` + `MultiselectService` → combined
- `TextInput` + `TextInputService` → combined
- `PasswordInput` + `PasswordInputService` → combined

**Keep explicit interfaces for:**

- `SourceHostProviders` + `SourceHostProvidersService` — the `SourceHostProvidersService` type is used directly by `SkillManager` and other extension managers to type the `sources` parameter. Converting would require importing the tag in more places.
- `Workspace` + `WorkspaceContextService` — referenced in ~30 test files for mock typing (`as WorkspaceContextService`, `as unknown as WorkspaceContextService`). The interface is the primary mock contract. Also, `WorkspaceContextService` is a large interface (50+ methods) — inlining it on the tag class would be unwieldy.

**Rationale:** Per the `effect-service` skill decision rule: "does this service have more than one implementation?" — No for all 11. The Layer system makes it cheap to extract an interface later.

**Alternatives considered:**

- Convert all 13 to combined — rejected because `Workspace` and `SourceHostProviders` have legitimate reasons for explicit interfaces (widespread test mock typing, large interface size, cross-module type references).

**Migration approach:** For each service, the `*Service` type export becomes `Context.Tag.Service<typeof Tag>`. Consumers importing `ClackLogService` directly would use `Context.Tag.Service<typeof ClackLog>` or simply reference the tag. The deprecated `LogService`/`SpinnerService` aliases in `clack-effect/index.ts` can be removed. Test files that type mocks against the removed `*Service` types will need updating to use `Context.Tag.Service<typeof Tag>` instead.

### D3: Test layer pattern — Ref-based state, `*Test` naming

**Decision:** Replace all 6 `make*TestLayer` factory functions with named `*Test` layer constants using `Ref`-based state accumulation.

Current pattern:

```typescript
// src/clack-effect/log/test.ts
export function makeClackLogTestLayer(): [Layer.Layer<ClackLog>, MockClackLogService] {
  const calls: ClackLogCall[] = [];
  // ... mutable arrays ...
  return [Layer.succeed(ClackLog, mock), mock];
}
```

New pattern:

```typescript
// src/clack-effect/log/ClackLogTest.ts
export const ClackLogTest = Layer.effect(
  ClackLog,
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<ClackLogCall>>([]);
    return {
      info: (msg) => Ref.update(calls, (c) => [...c, { method: "info", msg }]),
      // ...
      _calls: Ref.get(calls), // inspection API
    };
  }),
);
```

**File rename** (6 files — stay co-located per project convention, renamed from generic `test.ts` to `*Test.ts`):

- `src/clack-effect/log/test.ts` → `src/clack-effect/log/ClackLogTest.ts`
- `src/clack-effect/prompt/test.ts` → `src/clack-effect/prompt/ClackPromptTest.ts`
- `src/clack-effect/spinner/test.ts` → `src/clack-effect/spinner/ClackSpinnerTest.ts`
- `src/clack-effect/progress/test.ts` → `src/clack-effect/progress/ClackProgressTest.ts`
- `src/clack-effect/stream/test.ts` → `src/clack-effect/stream/ClackStreamTest.ts`
- `src/clack-effect/task-log/test.ts` → `src/clack-effect/task-log/ClackTaskLogTest.ts`

**Downstream impact:** ~46 test files import these factories. All imports and usages need updating:

- `const [layer, mock] = makeClackLogTestLayer()` → `ClackLogTest` (layer) + yield `_calls` for assertions
- Barrel re-exports from `src/clack-effect/*/index.ts` — remove test exports

**Alternatives considered:**

- Keep `[Layer, Mock]` pattern but rename to `*Test` — rejected because the tuple pattern exposes mutable arrays outside Effect context, contradicting the Ref-based guidance.
- Gradual migration (new tests use new pattern, old tests unchanged) — rejected because maintaining two patterns creates confusion.

**Risk:** This is the highest-effort change (46 files). See Risks section.

### D4: Eliminate `any` casts in `provide` helpers

**Decision:** Type all `provide` / `provideServices` helpers against the actual layer output in 4 files.

Affected files (both E and R use `any`):

- `cli-commands/skills/install/command-actions.ts:216` — `provide` uses `any, any`
- `cli-commands/packs/install/command-actions.ts:197` — `provide` uses `any, any`

Affected files (R uses `any`):

- `cli-commands/packs/install/plan.ts:86` — `provideServices` uses `any` in R
- `cli-commands/packs/uninstall/plan.ts:135` — `provideServices` uses `any` in R

The other install command-actions files (`commands/install`, `mcp-servers/install`) already have properly typed `provide` helpers. Follow their pattern:

```typescript
const provide = <A, E>(
  effect: Effect.Effect<A, E, SourceHostProviders | Workspace | ...>,
): Effect.Effect<A, E, never> => Effect.provide(effect, envLayer);
```

For the command-actions files, the `any` was introduced to bridge `PromptCancelled` in the error channel. The fix is to include `PromptCancelled` in the error union or use a type-safe cast at the specific call site rather than blanket `any`.

**Rationale:** `any` in the `provide` helper silently swallows missing dependency errors at compile time.

## Risks / Trade-offs

**[R1] Test layer migration touches ~46 files** → Mitigate by doing it as a single atomic task with find-and-replace. All test files follow the same destructuring pattern, making mechanical transformation feasible. Run full test suite after to catch any missed updates.

**[R2] Removing `*Service` type exports is a breaking change for external consumers** → Not a risk — this is an internal CLI package, not a library. No external consumers depend on these types.

**[R3] Ref-based test layers change assertion ergonomics** → Tests currently access `mock.logs.info` directly. With Ref, they'll need `yield* clackLog._calls` inside Effect context. This is more idiomatic but requires test code to be effectful. All tests already use `it.effect`, so this is compatible.

**[R4] Tag identifier changes affect debug output** → Tag strings appear in Effect traces and error messages. The new namespaced strings are longer but more informative. No functional impact.
