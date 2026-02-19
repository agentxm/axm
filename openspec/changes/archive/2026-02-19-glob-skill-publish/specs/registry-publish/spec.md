## MODIFIED Requirements

### Requirement: Publish managed extension to registry

`skills publish` SHALL write one or more managed extensions from `.axm/extensions/` to a target registry. The command SHALL accept glob patterns and multiple positional arguments that expand against installed skill names.

#### Scenario: Publish with explicit registry

- **WHEN** `skills publish @acme/skills/code-review --registry local` is called
- **THEN** the extension is published to the registry source named `local`

#### Scenario: Publish with default registry

- **WHEN** `skills publish @acme/skills/code-review` is called without `--registry`
- **THEN** the extension is published to the `default` named registry or the first configured registry source

#### Scenario: Bare name resolved with scope

- **WHEN** `skills publish code-review` is called and project scope is `@acme`
- **THEN** the extension `@acme/skills/code-review` is published

#### Scenario: Glob pattern publishes multiple skills

- **WHEN** `skills publish "effect-*"` is called and project scope is `@acme`
- **AND** managed skills `effect-basics` and `effect-stream` match the pattern
- **THEN** both `@acme/skills/effect-basics` and `@acme/skills/effect-stream` are published to the target registry

#### Scenario: Multiple positional arguments

- **WHEN** `skills publish "effect-*" commit` is called
- **THEN** all matched skills are published in a single plan
