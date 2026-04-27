# axm

Open agent extension manager for skills and more

Use extreme brevity and concision in all AGENTS.md and CLAUDE.md and SKILL.md instructions.

## Values

1. **Simplicity** - Clear, minimal, obvious.
2. **Reliability** - Trustworthy, resilient.
3. **Delight** - Intuitive, helpful, honest, responsive.
4. **Friendliness** - Welcoming, collaborative, open.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Standard library**: Effect v4 (concurrency, type safety, error handling, async, observability)
- **Monorepo**: Nx (task orchestration, caching, affected commands)
- **Package manager**: pnpm (workspaces)
- **CLI parsing**: `effect/unstable/cli`
- **CLI UI**: Repo-local prompt adapters plus a custom stderr renderer built on Effect ANSI primitives
- **Testing**: Vitest
- **Linting**: ESLint with @effect/eslint-plugin
- **Formatting**: Prettier

## Commands

All commands use `pnpm` scripts. Most build/test/lint/typecheck flows delegate to Nx for caching and `affected` variants. `pnpm axm` and `pnpm spike` run Bun entrypoints from source; they do not build first.

Do not bypass repo `pnpm` scripts or `pnpm nx` targets when an equivalent exists. This is a hard rule. Do not use direct tool invocations like `pnpm exec vitest`, `vitest`, `tsc`, `eslint`, `prettier`, or bare `nx` for repo verification when a repo-backed script or target exists. They can bypass repo conventions, dependency ordering, caching, and build steps and can pick up stale `dist` output.

For focused verification, keep the repo-backed target and pass filters through it:

- focused tests: `pnpm nx run <project>:test --args="path/to/test.ts"`
- focused test by name: `pnpm nx run <project>:test --args='path/to/test.ts -t "test name"'`
- focused typecheck: `pnpm nx run <project>:typecheck`

Only call a direct tool when no equivalent `pnpm` script or `pnpm nx` target exists, and say why.

Always set these before running any `pnpm` script or `pnpm nx` command:

```bash
export NX_TUI=false
export NX_DEFAULT_OUTPUT_STYLE=static
export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false
```

| Command                      | Purpose                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `pnpm axm`                   | Run the main CLI from source                                              |
| `./scripts/axm-local`        | Run the in-flight CLI from any working directory against a local registry |
| `pnpm spike`                 | Run the CLI spike from source                                             |
| `pnpm watch`                 | Rebuild `cli` on changes                                                  |
| `pnpm build`                 | Build all packages                                                        |
| `pnpm build:affected`        | Build only packages changed since `main`                                  |
| `pnpm test`                  | Run package test targets                                                  |
| `pnpm test:affected`         | Run tests only for packages changed since `main`                          |
| `pnpm test:e2e`              | Run E2E targets only                                                      |
| `pnpm typecheck`             | Type check all packages                                                   |
| `pnpm typecheck:affected`    | Type check only packages changed since `main`                             |
| `pnpm format`                | Format the whole repo with Prettier                                       |
| `pnpm format:check`          | Check whole-repo formatting with Prettier                                 |
| `pnpm format:affected`       | Format only Nx-selected changed files                                     |
| `pnpm format:check:affected` | Check only Nx-selected changed files                                      |
| `pnpm lint`                  | Lint all packages                                                         |
| `pnpm lint:affected`         | Lint only packages changed since `main`                                   |
| `pnpm lint:fix`              | Lint and auto-fix                                                         |
| `pnpm run ci`                | Run full CI pipeline (lint, typecheck, build, test, e2e)                  |
| `pnpm run ci:affected`       | Run CI pipeline for affected packages only                                |
| `pnpm generate`              | Generate registry and telemetry clients                                   |

`./scripts/axm-local` preserves your current working directory and only sets
`AXM_REGISTRY_LOCATION=http://localhost:4300` and `AXM_TELEMETRY=0` when they
are unset. When that location is HTTP(S), it also sets `AXM_REGISTRY_URL` to
the same value for auth/API flows.

For testing install, lint, and other default-source behavior, set
`AXM_REGISTRY_LOCATION` to a file path, `file://` URL, or HTTP(S) URL instead
of checking custom registry sources into `.axm/settings.json`. `axm lint`
reports workspace findings read-only; `axm lint --fix` reconciles the
workspace non-interactively via the plan pipeline.

### Releasing

For a new version release, follow `contributing/guides/releasing.md` exactly. Do not invent or restate a separate release flow here.

## Guides Index

Use `contributing/guides` for topic-level guidance. If a guide goes deeper than
the summary here, follow the guide.

| Guide                                                                       | When to consult                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Docs & process**                                                          |                                                                                        |
| [Guides README](contributing/guides/README.md)                              | Before adding a guide, read for template and local conventions                         |
| [Documentation Guidelines](contributing/guides/documentation-guidelines.md) | Before writing or editing docs, read for audience, flow, and source-of-truth rules     |
| [Guide Authoring](contributing/guides/guide-authoring.md)                   | Before deciding a topic needs a guide, read for scope and structure                    |
| [Instructions Guide](contributing/guides/instructions.md)                   | Before choosing README vs CONTRIBUTING vs AGENTS/CLAUDE vs install vs SKILL, read it   |
| [Agent Accessibility Guide](contributing/guides/agent-accessibility.md)     | When updating install.md or SKILL.md, read for accessibility checks                    |
| **Delivery**                                                                |                                                                                        |
| [Releasing Guide](contributing/guides/releasing.md)                         | Before planning or publishing a release, read the release flow                         |
| [Spec-Driven Development](contributing/guides/spec-driven-development.md)   | Before starting or progressing an OpenSpec change, read for workflow steps             |
| [Feature Delivery Guide](contributing/guides/feature-delivery.md)           | Before proposing, designing, implementing, or verifying a feature, read for checks     |
| **Implementation**                                                          |                                                                                        |
| [CLI Design Guide](contributing/guides/cli-design.md)                       | Before designing a CLI command, read for shape, flags, prompts, and handlers           |
| [CLI Renderer Guide](contributing/guides/cli-renderer.md)                   | Before changing JSON output or renderer boundaries, read for contracts and diagnostics |
| [Testing Guide](contributing/guides/testing.md)                             | Before writing or reviewing tests, read for levels, E2E scope, and Effect testing      |
| [Effect Guide](contributing/guides/effect.md)                               | Before writing Effect code, read for core patterns and the skill index                 |
| [Effect Option Guide](contributing/guides/effect-option.md)                 | When handling optional values in Effect code, read for Option and nullable boundaries  |
| [Effect v4 Quick Reference](contributing/guides/effect-v4-quick-ref.md)     | When translating v3-era examples, read for common v4 renames and migrations            |
| [Effect Errors Guide](contributing/guides/effect-errors.md)                 | Before designing or translating Effect errors, read for AppError and service patterns  |
| [Effect Layers Guide](contributing/guides/effect-layers.md)                 | Before building or wiring layers, read for composition and provision rules             |
| [Workspace Read Model Guide](contributing/guides/workspace-read-model.md)   | Before migrating workspace reads or using context test fixtures                        |
| [Logging Guide](contributing/guides/logging.md)                             | Before adding structured logs, read for logging conventions                            |
| [TypeScript Style Guide](contributing/guides/typescript-style.md)           | Before writing or revising TypeScript, read for narrowing and immutability rules       |

## Code Organization

Group by feature, not by type. Co-locate local constants, types, schemas,
errors, and tests with the feature that owns them.

- **Single-use** → in the component file
- **Shared within feature** → in a dedicated file in that feature folder (e.g., `schema.ts`)
- **Never** → cross-feature "constants.ts" or "types.ts" at the root

**`@agentxm/client-core` unstable namespace** — All core code lives under
`src/unstable/` and is exported via `@agentxm/client-core/unstable/*`. Never place core
code directly under `src/`.

## TypeScript

See [TypeScript Style Guide](contributing/guides/typescript-style.md) for
examples, narrowing patterns, and rationale.

### TS41 Messages

Address TS41xx diagnostic messages (template literal type errors) when discovered. Do not ignore or suppress them — fix the underlying type issue.

### Module Exports

One barrel file (`index.ts`) per folder. Each type is exported from exactly one
place. Do not re-export types across modules.

### No Type Assertions

Do not use `as` type assertions or non-null assertions (`!`).

- Allowed: `as const`, `as const satisfies T`
- Allowed at test boundaries: one `as unknown as T` per mock, with comment
- Rare escape hatch: `as unknown as T` with `// Assertion needed:` comment
- Validate parsed data with Schema instead of asserting it

## External Dependency Sources

Local source checkouts of key dependencies live at
`../external/{org}/{repo}` (relative to this repo root). Read these sources to
understand internal behavior beyond public API docs, learn idiomatic patterns
from reference implementations, and research bugs or breaking changes via
upstream issues and discussions. Each checkout should be on the tag matching the
dependency version so the source you read matches the code you run. For Effect,
use `../external/Effect-TS/effect-smol`, not `../../Effect-TS/effect-smol`.

| Package                  | Version         | Local path                          | Upstream                                                          | Tag                    |
| ------------------------ | --------------- | ----------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| `effect` (+ `@effect/*`) | `4.0.0-beta.50` | `../external/Effect-TS/effect-smol` | [Effect-TS/effect-smol](https://github.com/Effect-TS/effect-smol) | `effect@4.0.0-beta.50` |

Setup and sync instructions are in the
[agentxm-internal CLAUDE.md](../agentxm-internal/CLAUDE.md#external-dependency-sources).

## Effect

See [Effect Guide](contributing/guides/effect.md),
[Effect Option Guide](contributing/guides/effect-option.md),
[Effect v4 Quick Reference](contributing/guides/effect-v4-quick-ref.md), and
[Effect Errors Guide](contributing/guides/effect-errors.md).

- Use `../external/Effect-TS/effect-smol` for repo-matched Effect v4 references.
- No raw Promises or async/await in production code.
- Use `effect/FileSystem` and `effect/Path`, never `node:fs` or `node:path`.
- Run `pnpm typecheck` or `pnpm typecheck:affected` and fix all
  `@effect/language-service` diagnostics as part of the change.

## Testing

See [Testing Guide](contributing/guides/testing.md) and
[Feature Delivery Guide](contributing/guides/feature-delivery.md).

- Write tests first to define behavior
- Bug fix means regression test first
- Prefer `pnpm nx run <project>:test --args="..."` over direct `vitest`

## Spec-Driven Development

See [Spec-Driven Development](contributing/guides/spec-driven-development.md).

Accepted specs: `openspec/specs/<capability>/spec.md`. Active changes:
`openspec/changes/<change-id>/`.

## Git Workflow

**NEVER commit without explicit user request.** This is a hard rule with no exceptions.

- Do NOT commit after completing work
- Do NOT commit when tests pass
- Do NOT commit as part of a task workflow
- ONLY commit when the user explicitly asks (e.g., "commit", "/commit", "make a commit")

Wait for the user to review changes and decide when to commit.
