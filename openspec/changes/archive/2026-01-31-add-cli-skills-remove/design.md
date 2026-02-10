## Context

Adding a new `remove` sub-command to the `skills` command. This is initial scaffolding with placeholder behavior ("Hello Alex" output).

## Goals / Non-Goals

- Goals: Create working `axm skills remove` command that outputs "Hello Alex"
- Non-Goals: Actual skill removal functionality (future work)

## Decisions

- **DES-1: Follow existing command structure** — Mirror the `add` command file organization (`command.ts`, `handler.ts`) for consistency
- **DES-2: Use Effect for handler** — Handler returns Effect even for simple output, maintaining consistency with other commands
- **DES-3: No arguments required initially** — Command works without positional or optional arguments

## Risks / Trade-offs

- Placeholder behavior may confuse users → Document as placeholder in help text

## Migration Plan

N/A — New command with no existing users

## Open Questions

None
