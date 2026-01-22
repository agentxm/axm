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
   - [ ] Tests at all layers (unit, integration, E2E)
   - [ ] Tests should be:
     - Isolated - Same results regardless of run order
     - Composable - Test dimensions separately
     - Deterministic - Same result if nothing changes
     - Fast - Run quickly
     - Writable - Cheap to write relative to code cost
     - Readable - Comprehensible, motivation clear
     - Behavioral - Sensitive to behavior changes
     - Structure-insensitive - Insensitive to structure changes
     - Automated - Run without human intervention
     - Specific - Failure cause obvious
     - Predictive - Passing means production-ready
     - Inspiring - Passing inspires confidence

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
- **Business logic**: Effect (prefer Effect capabilities where they exist)
- **Testing**: Vitest
- **Formatting/Linting**: Biome (code), Prettier (markdown)

## Commands

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `pnpm build`     | Build all packages          |
| `pnpm test`      | Run tests (Vitest)          |
| `pnpm typecheck` | Type check without emitting |
| `pnpm format`    | Format code and markdown    |
| `pnpm lint`      | Lint with Biome             |
| `pnpm lint:fix`  | Lint and auto-fix           |

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

## Key References

- OpenSpec workflow: `openspec/AGENTS.md`

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
