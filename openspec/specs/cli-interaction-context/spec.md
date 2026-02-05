### Requirement: InteractionContext exposes Clack service via p property

The `InteractionContext` service SHALL expose the underlying `ClackService` via a `p` property for direct access to prompts, logging, spinners, and lifecycle methods.

#### Scenario: Access Clack prompts through p property

- **WHEN** handler accesses `ctx.interaction.p.confirm("Proceed?")`
- **THEN** the Clack confirm prompt is invoked

#### Scenario: Access Clack logging through p property

- **WHEN** handler accesses `ctx.interaction.p.log.success("Done")`
- **THEN** the Clack success log is invoked

#### Scenario: Access Clack spinner through p property

- **WHEN** handler accesses `ctx.interaction.p.spinner()`
- **THEN** a Clack spinner instance is returned

### Requirement: OperationContext exposes optional InteractionContext

The `OperationContext` service SHALL include an `interaction` field of type `Option<InteractionContext>`.

#### Scenario: Interactive mode provides Some

- **WHEN** command runs in interactive terminal
- **THEN** `OperationContext.interaction` is `Option.some(interactionContext)`

#### Scenario: Non-interactive mode provides None

- **WHEN** command runs non-interactively (CI, piped, --yes flag)
- **THEN** `OperationContext.interaction` is `Option.none()`

### Requirement: InteractionContext has live and test layers

The `InteractionContext` module SHALL export:

- `InteractionContextLive` — layer using real Clack prompts
- `InteractionContext.layer(service)` — layer from custom implementation

#### Scenario: Live layer uses Clack

- **WHEN** handler uses `InteractionContextLive`
- **THEN** `p` property returns live `ClackService` implementation

#### Scenario: Test layer uses mock

- **WHEN** test provides custom `InteractionContext.layer(mockService)`
- **THEN** `p` property returns mock implementation
