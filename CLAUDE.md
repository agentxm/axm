# Project Instructions

The `axm` CLI for managing extensions across AI coding agents.

## Quality Attributes

Apply these qualities to design, implementation, and verification:

1. **Simple** - Use the simplest mechanism that works. Clear code beats clever code.
   - [ ] Minimize indirection
   - [ ] No speculative code

2. **Fast** - Minimize time waiting.
   - [ ] Sub-second startup
   - [ ] Independent I/O ops run concurrently

3. **Testable** - Easy to test units in isolation, integrations at boundaries.
   - [ ] Business logic pure and isolated from I/O
   - [ ] Tests at all levels (unit, handler, E2E)

4. **Maintainable** - Easy to understand, change with confidence, and contribute to.
   - [ ] Consistent patterns across the codebase
   - [ ] Specs:
     - Organized hierarchically by capability
     - Capability specified for every meaningful system component
     - Just-enough specification, no duplication
     - Reference automated test suites as executable specifications (where they exist and are helpful)
     - Describe behavior and concepts from user's perspective, not implementation details

5. **Lovable** - A joy to use.
   - [ ] Intuitive interfaces, defaults, and minimal configuration
   - [ ] Clear error messages that guide toward resolution
   - [ ] Documentation matches reality

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm (workspaces)
- **CLI parsing**: yargs
- **CLI UI**: Bombshell (prompts, forms, validation)
- **Business logic**: Effect
- **Testing**: Vitest
- **Formatting/Linting**: Biome (code), Prettier (markdown)

## Effect

Effect for all business logic/I/O. No raw Promises or async/await.

## Commands

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `pnpm build`     | Build all packages          |
| `pnpm test`      | Run all tests (Vitest)      |
| `pnpm typecheck` | Type check without emitting |
| `pnpm format`    | Format code and markdown    |
| `pnpm lint`      | Lint with Biome             |
| `pnpm lint:fix`  | Lint and auto-fix           |

## Testing

Three test levels, each with different scope:

| Level   | Location                             | Tests                          |
| ------- | ------------------------------------ | ------------------------------ |
| Unit    | `packages/core/src/**/*.test.ts`     | Pure business logic, utilities |
| Handler | `packages/cli/src/**/__tests__/*.ts` | Effect handlers with mocks     |
| E2E     | `packages/cli/e2e/*.test.ts`         | Full CLI as subprocess         |

```bash
pnpm test                              # Run all tests
pnpm test packages/cli/e2e/            # Run E2E tests only
pnpm test packages/core/               # Run unit tests only
pnpm test -- --watch                   # Watch mode
```

**Key principles:** Isolated (fresh state per test), deterministic (same result if nothing changes), behavioral (test what code does, not how it's structured).

## Project Structure

```
packages/           # All packages live here
  cli/              # @agentxm/cli - Thin CLI layer (yargs parsing, Effect handler wiring)
  core/             # @agentxm/core - Domain logic, types, and utilities (no CLI concerns)
openspec/           # Spec-driven development
  specs/            # Implemented capabilities
    <capability>/
    <capability>-<sub>/
    <capability>-<sub>-<subsub>/
  changes/          # Proposed changes
docs/guides/        # Reference documentation
```

## Guides and Skills

**Guides** (`docs/guides/`) = high-level rationale for humans. **Skills** = tactical patterns for agents (auto-load when relevant).

**Auto-loading skills:** `effect-basics`, `effect-service`, `effect-testing`, `cli-conventions`, `bombshell`, `testing-basics`, `testing-unit`, `testing-handler`, `testing-e2e`, `documentation`, `agent-docs`.

## Task Management Workflow

This project uses **beads (`bd`) CLI** for ALL task management:

- **Creating tasks**: Use `bd` to create new tasks
- **Editing tasks**: Use `bd` to update task details
- **Progress tracking**: Use `bd` to track task status and completion

**Common bd commands:**

```bash
bd list --status=open              # Find work to do
bd show <id>                       # View task details and dependencies
bd update <id> --status=in-progress  # Mark task started
bd close <id> --reason "..."       # Close with context (not --comment)
```

**Sub-agent spawning**: Always spawn a sub-agent (using the Task tool) to work on each individual task. This ensures:

- Fresh context window for each task
- Focused work without context pollution
- Clean separation of concerns between tasks
- Better token efficiency for complex work

Do NOT use Claude Code's built-in task tools (TaskCreate, TaskUpdate, TaskList, etc.) for task management in this project.

## Git Workflow

**NEVER commit without explicit user request.** This is a hard rule with no exceptions.

- Do NOT commit after completing work
- Do NOT commit when tests pass
- Do NOT commit as part of a task workflow
- ONLY commit when the user explicitly asks (e.g., "commit", "/commit", "make a commit")

Wait for the user to review changes and decide when to commit.

<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->
