## ADDED Requirements

### Requirement: Service tags use namespaced identifiers

All `Context.Tag` definitions in `packages/cli/src/` SHALL use the `@axm.sh/cli/` prefix in their tag identifier string. Existing sub-namespaces (e.g., `@axm.sh/cli/clack-effect/`) are acceptable.

#### Scenario: Manager service tags are namespaced

- **WHEN** inspecting `SkillManager`, `PackManager`, `CommandManager`, `McpServerManager` tag definitions
- **THEN** each tag identifier string starts with `@axm.sh/cli/`

#### Scenario: Workflow action service tags are namespaced

- **WHEN** inspecting all 8 `Install*CommandWorkflowActions` and `Uninstall*CommandWorkflowActions` tag definitions
- **THEN** each tag identifier string starts with `@axm.sh/cli/`

### Requirement: Single-implementation services use combined tag pattern

Services with only one implementation SHALL use the combined `Context.Tag` class with inline interface, not a separate explicit interface type.

#### Scenario: Clack services use combined pattern

- **WHEN** inspecting `ClackLog`, `ClackSpinner`, `ClackPrompt`, `ClackProgress`, `ClackTaskLog`, `ClackStream` definitions
- **THEN** each defines its interface inline on the `Context.Tag` class with no separate `*Service` type export

#### Scenario: Legacy prompt services use combined pattern

- **WHEN** inspecting `Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput` definitions
- **THEN** each defines its interface inline on the `Context.Tag` class with no separate `*Service` type export

#### Scenario: Multi-consumer services retain explicit interfaces

- **WHEN** inspecting `Workspace` and `SourceHostProviders` definitions
- **THEN** each retains its separate explicit interface (`WorkspaceContextService`, `SourceHostProvidersService`)

### Requirement: Test layer factories use Ref-based state and named constants

Test layer factories in `src/clack-effect/` SHALL be named `*Test` constants using `Ref`-based state accumulation, not `make*TestLayer` functions returning `[Layer, Mock]` tuples.

#### Scenario: Test layers are named constants

- **WHEN** inspecting test layer exports from `src/clack-effect/`
- **THEN** each is a named constant (e.g., `ClackLogTest`) not a factory function

#### Scenario: Test layers use Ref for state

- **WHEN** a test layer accumulates state for assertion (e.g., logged messages)
- **THEN** state is stored in a `Ref` and exposed via an inspection API (e.g., `_calls`)

#### Scenario: Test layer files use descriptive names

- **WHEN** inspecting test layer files in `src/clack-effect/*/`
- **THEN** each is named `*Test.ts` (e.g., `ClackLogTest.ts`), not `test.ts`

### Requirement: Provide helpers use typed parameters

All `provide` and `provideServices` helper functions in production code SHALL type their `Effect` parameter with explicit service and error unions, not `any`.

#### Scenario: Command-actions provide helpers are typed

- **WHEN** inspecting `provide` helpers in `cli-commands/skills/install/command-actions.ts` and `cli-commands/packs/install/command-actions.ts`
- **THEN** neither the error (`E`) nor requirements (`R`) parameter uses `any`

#### Scenario: Plan provideServices helpers are typed

- **WHEN** inspecting `provideServices` helpers in `cli-commands/packs/install/plan.ts` and `cli-commands/packs/uninstall/plan.ts`
- **THEN** the requirements (`R`) parameter does not use `any`
