## 1. Project Setup

- [ ] 1.1 Add dependencies: `ink`, `react`, `@types/react`, `ink-text-input`, `ink-select-input`, `ink-spinner`, `ink-testing-library` to `packages/cli`
- [ ] 1.2 Add `"jsx": "react-jsx"` and `"jsxImportSource": "react"` to `tsconfig.base.json`
- [ ] 1.3 Create `src/tui/` directory structure with `index.ts` barrel and `errors.ts` (shared `PromptError`, `PromptCancelled`)
- [ ] 1.4 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — verify no regressions from setup changes
- [ ] 1.5 Kill any vitest worker processes

## 2. Log Service

- [ ] 2.1 Write tests for Log service (info, warn, error, success, message output + test layer records calls)
- [ ] 2.2 Implement `src/tui/log/` — service, live layer (direct stdout writes), test layer, barrel
- [ ] 2.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 2.4 Kill any vitest worker processes

## 3. Spinner Service

- [ ] 3.1 Write tests for Spinner service (start/stop + test layer records calls)
- [ ] 3.2 Implement `src/tui/spinner/` — service, types (`SpinnerHandle`), Ink component, live layer, test layer, barrel
- [ ] 3.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 3.4 Kill any vitest worker processes

## 4. Note Service

- [ ] 4.1 Write tests for Note service (with title, without title + test layer records calls)
- [ ] 4.2 Implement `src/tui/note/` — service, live layer (direct stdout writes), test layer, barrel
- [ ] 4.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 4.4 Kill any vitest worker processes

## 5. Text Input Service

- [ ] 5.1 Write tests for TextInput service (basic input, placeholder, default value, validation, cancellation + test layer)
- [ ] 5.2 Implement `src/tui/text-input/` — service, types (`TextInputConfig`), Ink component, live layer, test layer, barrel
- [ ] 5.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 5.4 Kill any vitest worker processes

## 6. Password Input Service

- [ ] 6.1 Write tests for PasswordInput service (masked display, custom mask, cancellation + test layer)
- [ ] 6.2 Implement `src/tui/password-input/` — service, types (`PasswordInputConfig`), Ink component, live layer, test layer, barrel
- [ ] 6.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 6.4 Kill any vitest worker processes

## 7. Confirm Service

- [ ] 7.1 Write tests for Confirm service (default yes, default no, user selects no, cancellation + test layer)
- [ ] 7.2 Implement `src/tui/confirm/` — service, types (`ConfirmConfig`), Ink component, live layer, test layer, barrel
- [ ] 7.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 7.4 Kill any vitest worker processes

## 8. Select Service

- [ ] 8.1 Write tests for Select service (basic selection, hints, cancellation + test layer with index and cancel behaviors)
- [ ] 8.2 Implement `src/tui/select/` — service, types (`SelectConfig`), Ink component, live layer, test layer, barrel
- [ ] 8.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 8.4 Kill any vitest worker processes

## 9. Multiselect Service

- [ ] 9.1 Write tests for Multiselect service (basic multiselect, initial values, required flag, cancellation + test layer)
- [ ] 9.2 Implement `src/tui/multiselect/` — service, types (`MultiselectConfig`), Ink component, live layer, test layer, barrel
- [ ] 9.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 9.4 Kill any vitest worker processes

## 10. TUI Barrel and Convenience Layer

- [ ] 10.1 Update `src/tui/index.ts` barrel to re-export all component public APIs and a merged `TuiLive` convenience layer
- [ ] 10.2 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 10.3 Kill any vitest worker processes

## 11. Dev Entry Point

- [ ] 11.1 Create `src/dev/tui.ts` with yargs sub-commands for each component demo (text-input, password-input, confirm, select, multiselect, spinner, log, note)
- [ ] 11.2 Add `"tui": "bun src/dev/tui.ts"` script to `packages/cli/package.json`
- [ ] 11.3 Manually verify each demo sub-command works: `pnpm tui log`, `pnpm tui spinner`, `pnpm tui note`, `pnpm tui text-input`, `pnpm tui password-input`, `pnpm tui confirm`, `pnpm tui select`, `pnpm tui multiselect`
- [ ] 11.4 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any issues
- [ ] 11.5 Kill any vitest worker processes
