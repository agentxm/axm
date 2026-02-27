## Why

The CLI currently uses Ink (React-based terminal UI) for all interactive components — spinners, prompts, confirmations, selects. This pulls in React as a runtime dependency for a CLI tool, adds complexity through JSX rendering loops and component lifecycles, and creates a heavyweight abstraction for what are fundamentally simple terminal interactions. The `clack-effect` module has already been implemented as a direct replacement, wrapping `@clack/prompts` with Effect services. It's time to switch all consumers over and remove Ink.

## What Changes

- **BREAKING**: Replace all Ink-based TUI services (`Spinner`, `Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput`, `Note`, `Log`) with their `clack-effect` equivalents (`ClackSpinner`, `ClackPrompt`, `ClackLog`, etc.)
- Migrate all ~70 handler and operation files that import from `@/tui` to import from `@/clack-effect`
- Adapt service call sites to the clack-effect API (e.g., `Confirm` → `ClackPrompt.confirm`, `Select` → `ClackPrompt.select`)
- Update all ~40 test files that mock TUI services to use clack-effect test utilities
- Update the runtime layer to provide `ClackLive` instead of Ink-based TUI layers
- Remove the `src/tui/` directory entirely (~1,144 lines)
- Remove `ink`, `ink-spinner`, `ink-select-input`, `ink-text-input`, and `react` dependencies
- Update dev CLI TUI playground commands to use clack-effect

## Capabilities

### New Capabilities

_(None — clack-effect is already implemented. This change is about wiring it in.)_

### Modified Capabilities

- `tui-spinner`: Requirements change from Ink-based rendering to clack-effect `ClackSpinner` service API
- `tui-confirm`: Requirements change from Ink component to `ClackPrompt.confirm`
- `tui-select`: Requirements change from Ink component to `ClackPrompt.select`
- `tui-multiselect`: Requirements change from Ink component to `ClackPrompt.multiselect`
- `tui-text-input`: Requirements change from Ink component to `ClackPrompt.text`
- `tui-password-input`: Requirements change from Ink component to `ClackPrompt.password`
- `tui-note`: Requirements change from Ink component to `ClackLog.note`
- `tui-log`: Requirements change from Ink-based log service to `ClackLog` service API

## Impact

- **Dependencies**: Removes `ink`, `ink-spinner`, `ink-select-input`, `ink-text-input`, `react` (~5 packages). Keeps `@clack/prompts` (already a dependency).
- **Code**: ~70 source files and ~40 test files need import and API updates. `src/tui/` directory deleted. Runtime layer updated.
- **Build**: Removes JSX/TSX compilation requirement for TUI components.
- **Testing**: Test mocks simplify — no more React rendering, just plain Effect service mocks.
- **Users**: Interactive prompts will have a different visual style (clack's styled prompts vs Ink's React-rendered UI). Functional behavior is equivalent.
