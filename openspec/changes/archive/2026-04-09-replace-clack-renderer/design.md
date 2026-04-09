## Context

The CLI has migrated interactive prompts from `@clack/prompts` to Effect v4's native `Prompt` module. The `CliRenderer` interactive implementation still delegates all stderr chrome — log lines, spinners, progress bars, notes, boxes — to clack. This creates two visual languages in one CLI session: Effect's flat `? message ›` / `✔ message … value` style alongside clack's `│`-prefixed vertical guide bar style.

Effect v4's ANSI primitives (`effect/unstable/cli/internal/ansi`) provide `annotate`, color constants, cursor control, and line erasure — enough to build custom chrome without clack.

The `CliRenderer` service interface (`cli-renderer.ts`) is unchanged. Only the `InteractiveRenderer` layer implementation changes. The `MachineRenderer` and `TestRenderer` are unaffected.

## Goals / Non-Goals

**Goals:**

- Replace all `@clack/prompts` usage in `InteractiveRenderer` with custom rendering that visually complements Effect v4 Prompt output
- Remove `@clack/prompts` as a dependency from `packages/core` and `packages/cli`
- Remove the legacy `cli-prompt` clack adapter files
- Use Effect's ANSI primitives for styling where possible
- Keep the `CliRenderer` service interface stable — no API changes

**Non-Goals:**

- Changing the `MachineRenderer` or `TestRenderer` implementations
- Changing the `CliRenderer` service interface
- Replicating clack's full feature set — only implement what `CliRenderer` actually uses
- Implementing a general-purpose terminal UI framework
- Matching clack's visual style — the point is to depart from it

## Decisions

### 1. Visual language: flat, symbol-prefixed lines

Adopt Effect Prompt's conventions:

| Element   | Rendering                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Log lines | `symbol message` — `●` info (cyan), `✔` success (green), `▲` warn (yellow), `✖` error (red), `◆` step (cyan), `○` message (dim) |
| intro     | `◇ title` (cyan, bold)                                                                                                          |
| outro     | `◇ message` (green)                                                                                                             |
| cancel    | `■ message` (red)                                                                                                               |
| note      | `message` body with `─` top/bottom rules and optional title                                                                     |
| box       | Same as note with configurable alignment and padding                                                                            |
| spinner   | `◒ message` cycling through `◒◐◓◑` with ANSI line erasure, final state uses success/error/cancel symbols                        |
| progress  | `◒ [████░░░░░░] 42% message` with bar rendering, same spinner character during indeterminate                                    |

**Rationale:** Effect prompts use `?` / `✔` / `›` as leading symbols with no vertical bars. Our chrome should use the same flat, symbol-led pattern so output reads as one cohesive stream.

**Alternatives considered:**

- (a) Keep clack's `│` style — rejected, visual mismatch with Effect prompts
- (b) Use no symbols, just indentation — rejected, harder to scan log output
- (c) Use Effect's exact symbols (`?`, `✔`) — rejected, would be confusing since those already mean "prompt" and "submitted"

### 2. Build on Effect ANSI primitives + direct ANSI codes

Use `annotate`, color constants, and cursor control from `effect/unstable/cli/internal/ansi`. For anything not exported (e.g., specific cursor movements), use raw ANSI escape sequences directly.

**Rationale:** Effect's ANSI module covers the styling and cursor basics. It's already a dependency. No need for a third-party ANSI library.

**Alternatives considered:**

- (a) Use `chalk` or `picocolors` — rejected, unnecessary dependency when Effect provides primitives
- (b) Write our own complete ANSI module — rejected, Effect's module is sufficient

### 3. Spinner implementation with interval-based frame cycling

Use `setInterval` to cycle spinner characters (`◒◐◓◑`) and ANSI line erasure to update in place. Wrap in `Effect.acquireRelease` to ensure cleanup.

**Rationale:** This is the same approach clack uses internally. Simple, well-understood, works in all terminals.

### 4. Progress bar with block characters

Render `[████░░░░░░] 42%` using `█` (filled) and `░` (empty) with the spinner character as leading symbol. Bar width adapts to terminal width.

**Rationale:** Clean, widely supported, readable at a glance.

### 5. Table/detail/tree drop `│` prefix

Remove the `│  ` guide prefix from all data display formatters. Use clean indentation with 2-space indent for tree nesting.

**Rationale:** The `│` prefix was clack's visual language. Without it in prompts, it looks orphaned in data output.

### 6. Remove cli-prompt clack adapter

Delete `packages/core/src/unstable/cli-prompt/cli-prompt-interactive.ts`, `clack-prompt-options.ts`, and their tests. These wrapped clack's prompt functions for the old prompt system. Effect v4 prompts replace them entirely.

**Rationale:** Dead code after the prompt migration.

### 7. Write to stderr via Terminal service where practical, fallback to process.stderr

The `Terminal` service's `display()` writes to stdout. For stderr chrome output, use `process.stderr.write()` directly (same as the current implementation). Data display (table/detail/tree) continues writing to stdout via `process.stdout.write()`.

**Rationale:** The `Terminal` service doesn't provide stderr access. Stderr chrome is an implementation detail of the interactive renderer, not a service boundary worth abstracting.

## Risks / Trade-offs

- **Visual regression** — Users familiar with clack's styled output will see different chrome. → Mitigation: The new style is intentionally better-integrated with Effect prompts, which users are already seeing. Net improvement.
- **Spinner terminal compatibility** — Unicode spinner characters may not render on all terminals. → Mitigation: The characters chosen (`◒◐◓◑`) have broad Unicode support. Fallback to ASCII (`-\|/`) could be added later if needed but is not in scope.
- **`ansi.ts` is `@internal`** — Effect marks most ANSI exports as internal. → Mitigation: `annotate` and `combine` are public. Colors are stable. If internals change, we can inline the few escape sequences we need — they're just string constants.
