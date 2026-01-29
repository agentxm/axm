# axm

Open agent extension manager for skills and more

## Values

1. **Simplicity** - Clear, minimal, obvious.
2. **Reliability** - Trustworthy, resilient.
3. **Delight** - Intuitive, helpful, honest, responsive.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm (workspaces)
- **CLI parsing**: yargs
- **CLI UI**: Bombshell (prompts, forms, validation)
- **Business logic**: Effect
- **Testing**: Vitest
- **Formatting/Linting**: Biome (code), Prettier (markdown)

## Commands

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `pnpm build`     | Build all packages          |
| `pnpm test`      | Run all tests (Vitest)      |
| `pnpm test:e2e`  | Run E2E tests only          |
| `pnpm typecheck` | Type check without emitting |
| `pnpm format`    | Format code and markdown    |
| `pnpm lint`      | Lint with Biome             |
| `pnpm lint:fix`  | Lint and auto-fix           |

## Testing

Unit, handler, and e2e tests colocated with source.

- [ ] Designs prescribe testing for key elements
- [ ] Write tests first to define desired behavior
- [ ] Implement until tests pass
- [ ] Bug fix → regression test first

## Effect

Effect for all business logic/I/O. No raw Promises or async/await.

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
```

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
