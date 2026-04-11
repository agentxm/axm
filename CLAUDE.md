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

Do not bypass repo `pnpm` scripts or `pnpm nx` targets when an equivalent exists. Direct tool invocations like `pnpm exec vitest`, `tsc`, `eslint`, `prettier`, or raw `nx` can bypass repo conventions, dependency ordering, caching, and build steps and can pick up stale `dist` output.

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
`AXM_REGISTRY_URL=http://localhost:4300` and `AXM_TELEMETRY=0` when they are
unset, so it behaves like the real CLI while targeting a local registry by
default.

### Releasing

For a new version release, follow `contributing/guides/releasing.md` exactly. Do not invent or restate a separate release flow here.

## Guides Index

Use `contributing/guides` for topic-level guidance. If a guide goes deeper than
the summary here, follow the guide.

| Guide                                                                       | When to consult                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Docs & process**                                                          |                                                                                      |
| [Guides README](contributing/guides/README.md)                              | Adding a guide; template and local conventions                                       |
| [Documentation Guidelines](contributing/guides/documentation-guidelines.md) | Writing or editing docs; audience, flow, and source-of-truth rules                   |
| [Guide Authoring](contributing/guides/guide-authoring.md)                   | Deciding whether a topic needs a guide; structuring guide content                    |
| [Instructions Guide](contributing/guides/instructions.md)                   | README vs CONTRIBUTING vs AGENTS/CLAUDE vs INSTALL vs SKILL ownership                |
| [Agent Accessibility Guide](contributing/guides/agent-accessibility.md)     | Updating INSTALL.md or SKILL.md after CLI or workflow changes                        |
| **Delivery**                                                                |                                                                                      |
| [Releasing Guide](contributing/guides/releasing.md)                         | Planning, preparing, publishing, or checking a release                               |
| [Spec-Driven Development](contributing/guides/spec-driven-development.md)   | OpenSpec workflow from proposal through archive                                      |
| [Feature Delivery Guide](contributing/guides/feature-delivery.md)           | Proposal, design, implementation, and verification checks                            |
| **Implementation**                                                          |                                                                                      |
| [CLI Design Guide](contributing/guides/cli-design.md)                       | Command shape, flags, prompts, handlers, and parent command behavior                 |
| [CLI Renderer Guide](contributing/guides/cli-renderer.md)                   | Machine-readable JSON output, renderer boundaries, and diagnostics                   |
| [Testing Guide](contributing/guides/testing.md)                             | Test levels, E2E scope, and Effect testing references                                |
| [Effect Guide](contributing/guides/effect.md)                               | Core Effect patterns and skill index                                                 |
| [Effect Option Guide](contributing/guides/effect-option.md)                 | Option vs nullable values and boundary conversions                                   |
| [Effect v4 Quick Reference](contributing/guides/effect-v4-quick-ref.md)     | Common v3 to v4 renames and migration patterns                                       |
| [Effect Errors Guide](contributing/guides/effect-errors.md)                 | Error architecture, AppError conventions, typed service errors, Result type guidance |
| [Effect Layers Guide](contributing/guides/effect-layers.md)                 | Layer construction, composition, provision, and dependency wiring                    |
| [Logging Guide](contributing/guides/logging.md)                             | Structured logging with Effect                                                       |
| [TypeScript Style Guide](contributing/guides/typescript-style.md)           | Assertion-free TypeScript, narrowing, and immutability                               |

### Nx

Nx orchestrates the monorepo. Configuration lives in `nx.json` (workspace-level) and per-package `project.json` files.

- **TypeScript plugin** — `nx.json` configures `@nx/js/typescript` for TypeScript target inference.
- **Project targets** — many projects still define `build`, `lint`, `test`, `e2e`, `compile`, or publish targets explicitly in `project.json`.
- **Target defaults** — `nx.json` `targetDefaults` set caching, inputs, and dependency ordering for shared targets like `lint` and `test`.
- **Named inputs** — `default` and `production` input sets control cache invalidation. Test files and vitest configs are excluded from `production`.
- **Module boundaries** — `@nx/enforce-module-boundaries` ESLint rule enforces dependency constraints via project tags (`type:app` can depend on `type:lib`, not vice versa).
- **Always** set these before running any `pnpm` script or `nx` command:

```bash
export NX_TUI=false                         # Disable interactive terminal UI (requires human input, produces unparseable ANSI output)
export NX_DEFAULT_OUTPUT_STYLE=static       # Buffer each task's output and print as a clean block (prevents interleaving during parallel execution)
export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false # Disable dynamic line-rewriting (older Nx fallback for same issue as TUI)
```

- Agents should export them in their shell before invoking Nx-backed commands.
- CI may set them in workflow or job `env`.
- Prefer not to rewrite checked-in repo scripts just to inject them.
- Prefer `pnpm nx ...`, not bare `nx ...`.
- For focused tests, keep the Nx target and pass Vitest filters through it, for example `pnpm nx test cli -- src/root/install/handler.test.ts`.
- File filters passed through `pnpm nx test <project> -- ...` are relative to that target's `cwd` from `project.json`.
- Formatting strategy: `pnpm format` and `pnpm format:check` are the canonical
  full-repo Prettier commands. `pnpm format:affected` and
  `pnpm format:check:affected` are Nx conveniences for changed-file ranges only.

## CLI Conventions

See [CLI Design Guide](contributing/guides/cli-design.md) for command structure,
flags, and prompt behavior. See
[CLI Renderer Guide](contributing/guides/cli-renderer.md) for machine-readable
output and renderer contracts.

### Global Flags

- `--non-interactive` applies to every command
- `--json` / `-j` outputs machine-readable JSON
- `--verbose` / `-v`, `--debug`, `--quiet` / `-q` control verbosity
- No prompt may block in non-interactive mode
- Resolution chain: explicit `--non-interactive` → `CI=true` → `!stdin.isTTY`

### Per-Command Flags

- Shared reusable flags live in `@axm.sh/core/unstable/cli-flags`
- CLI-local flags live in `packages/cli/src/cli-flags.ts`
- Per-command flag values are passed as explicit handler args, not read from a
  service
- `--yes` only skips yes/no confirmations
- `--force` overrides blocking constraints and does not imply `--yes`
- `--preview` is display-only unless combined with explicit confirmation
- Blockers are errors; non-blockers are warnings

## Code Organization

Group by feature, not by type. Co-locate constants, types, and schemas with the components that use them.

- **Single-use** → in the component file
- **Shared within feature** → in a dedicated file in the feature folder (e.g., `schema.ts`)
- **Never** → cross-feature "constants.ts" or "types.ts" at the root

```typescript
// Good: constant lives with its feature
// settings/settings.ts
export const SETTINGS_FILENAME = "settings.json";

// Good: schema shared across feature components
// lockfile/schema.ts (used by multiple lockfile components)
export class LockfileSchema extends Schema.Class<LockfileSchema>("LockfileSchema")({...}) {}

// Bad: generic constants file far from usage
// src/constants.ts
export const SETTINGS_FILENAME = "settings.json";
export const LOCKFILE_NAME = "axm-lock.yaml";
```

### Project Structure

```
nx.json               # Nx workspace config
project.json          # Root project for workspace-level tasks
packages/
  core/               # @axm.sh/core shared services, schemas, runtime helpers
    src/unstable/     # Entire public surface is intentionally unstable
      app-error/
      auth/
      cli-flags/
      cli/
      cli-renderer/
      cli-runtime/
      commands/
      extensions/
      git/
      lockfile/
      mcp-servers/
      packs/
      registry/
      skills/
  cli/                # Main axm CLI
    src/
      app.ts
      main.ts
      cli-flags.ts
      root/
        auth/
        commands/
        mcp-servers/
        packs/
        skills/
        init.ts
  cli-spike/          # Effect CLI spike app
  cli-e2e/            # Built cli E2E, binary smoke, install verification
  cli-spike-e2e/      # Built cli-spike E2E
  e2e-utils/          # Shared subprocess and temp-dir helpers
  utils/              # Small shared utilities
openspec/
  specs/              # Accepted capabilities in */spec.md
  changes/            # Active changes with proposal/design artifacts
```

Each feature folder is self-contained: logic, constants, errors, schemas, and tests stay near the code that uses them. Only `utils/` holds truly cross-cutting helpers.

**`@axm.sh/core` unstable namespace** — All code in the core package lives under `src/unstable/` and is exported via `@axm.sh/core/unstable/*`. This signals that the package API is highly unstable and subject to breaking changes. Never place code directly under `src/` in core — always use the `unstable/` namespace.

### Command Arg Type Naming

- Command arg types (CLI parser): `<Command>CommandArgs` (e.g. `InstallCommandArgs`)
- Handler arg types (Effect): `<Command>HandlerArgs` (e.g. `InstallHandlerArgs`)
- Handler args use idiomatic Effect types (`Option`, `ReadonlyArray`, etc.) — not raw JS types
- Commands map command args → handler args at the boundary (e.g. `Option.fromUndefinedOr(argv.name)`)

### Handlers

See [CLI Design Guide](contributing/guides/cli-design.md).

- Handlers are effectful entry points for command behavior
- Parsing stays at the command boundary; handlers accept parsed input
- Handlers return Effects and require dependencies via layers

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
| `effect` (+ `@effect/*`) | `4.0.0-beta.42` | `../external/Effect-TS/effect-smol` | [Effect-TS/effect-smol](https://github.com/Effect-TS/effect-smol) | `effect@4.0.0-beta.42` |

Setup and sync instructions are in the
[agentxm-internal CLAUDE.md](../agentxm-internal/CLAUDE.md#external-dependency-sources).

## Effect

See [Effect Guide](contributing/guides/effect.md),
[Effect Option Guide](contributing/guides/effect-option.md), and
[Effect v4 Quick Reference](contributing/guides/effect-v4-quick-ref.md).

- Refer to `../external/Effect-TS/effect-smol` (repo-root-relative) for
  idiomatic Effect v4 reference implementations and Effect v4 capability/API
  questions.

- Use Effect collection types in signatures
- Prefer `Option<T>` internally; convert nullable values at boundaries
- No raw Promises or async/await in production code
- Errors are typed in the Effect signature
- Dependencies use services, not direct imports
- Resources use acquire/release patterns
- Layers provide dependencies at the edge
- Use `Effect.all` or `Effect.forEach` when work can run in parallel
- Avoid `for` or `while` loops containing `yield*` when the iterations are
  independent
- Use `effect/FileSystem` and `effect/Path` in production code, never
  `node:fs` or `node:path`

### Type Inference

- Prefer inference over explicit return annotations so the `R` parameter tracks
  dependencies automatically
- Avoid tacit point-free style when it harms inference
- Add explicit annotations at published package boundaries (types consumed
  by external callers), recursive functions, and `Effect.async` boundaries
- Internal monorepo functions — even if exported across workspace packages —
  do not need return type annotations

### Effect Language Service

When implementing Effect code, run `pnpm typecheck` (or `pnpm typecheck:affected`) and address any diagnostics emitted by the `@effect/language-service` plugin as part of the implementation work.

### Error Handling Patterns

See [Effect Errors Guide](contributing/guides/effect-errors.md) for full
conventions, recovery operators, and service error channel design.

- Two-layer error model: services MAY use typed `Data.TaggedError` subclasses
  for internal precision; command handlers MUST translate all errors to
  `AppError` before the runtime boundary
- `AppError` is the CLI-facing error type; error codes use stable `AREA_REASON`
  names
- `run` only accepts `Effect<A, AppError | PromptCancelled, R>`
- `PromptCancelled` is control flow, not an error
- Typed service errors earn their keep when callers need distinct recovery
  strategies, the error carries structurally different metadata, or it
  represents control flow (like `PromptCancelled`); otherwise use `AppError`
  with a code
- Expected failures live in the `E` channel; defects crash
- Do not throw in helpers except deliberate `unsafe*` or `*OrThrow` escape
  hatches
- Preserve `cause` when wrapping failures
- Return `Option<T>` for expected not-found cases
- Validate parsed data with Schema

## Testing

See [Testing Guide](contributing/guides/testing.md) and
[Feature Delivery Guide](contributing/guides/feature-delivery.md).

- Designs prescribe testing for changed behavior
- Write tests first to define behavior
- Bug fix means regression test first
- Unit tests live beside the code they cover
- Distribution E2E tests live in `packages/<cli>-e2e/` and run against `dist/`
- Prefer seams and test layers over mocks; mock third-party boundaries only when an explicit seam is impractical
- Avoid tests that only restate declarations or source structure; test observable behavior or enforce the rule with static analysis
- Prefer `@effect/vitest` helpers like `it.effect`, `it.scoped`, and `it.layer` for new Effect tests

### Test Organization

- Co-locate tests with the code they verify
- Keep helpers and fixtures near the tests that use them
- E2E tests focus on user-visible behavior, not internals

### Test Quality

- Tests should be isolated, deterministic, behavioral, structure-insensitive,
  specific, readable, and predictive

## Spec-Driven Development

See [Spec-Driven Development](contributing/guides/spec-driven-development.md).

- Specs define what; design defines how
- Accepted specs live in `openspec/specs/<capability>/spec.md`
- Active changes live in `openspec/changes/<change-id>/proposal.md`,
  `design.md`, and `.openspec.yaml`
- `spec.md` contains user-facing behavior and API contracts only
- `design.md` contains the technical approach and implementation guidance

## Findings Presentation

When a review or analysis produces findings, present each as a numbered item with:

1. **Finding** — what was observed
2. **Options** — lettered remediation choices (a, b, c, ...)
3. **Recommendation** — which option to take and why

```
### 1. <Finding title>

<Description of the issue>

  a) <Option A> — <brief description>
  b) <Option B> — <brief description>
  c) <Option C> — <brief description>

**Recommendation:** (b) — <rationale>
```

## Git Workflow

**NEVER commit without explicit user request.** This is a hard rule with no exceptions.

- Do NOT commit after completing work
- Do NOT commit when tests pass
- Do NOT commit as part of a task workflow
- ONLY commit when the user explicitly asks (e.g., "commit", "/commit", "make a commit")

Wait for the user to review changes and decide when to commit.
