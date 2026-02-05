## 1. Audit and Fix packages/core

- [ ] 1.1 Search for `T[]` type annotations in packages/core/src
- [ ] 1.2 Search for `ReadonlyArray<` and `readonly T[]` patterns in packages/core/src
- [ ] 1.3 Search for `Record<` type annotations in packages/core/src
- [ ] 1.4 Fix violations: replace with `Array.Array<T>` and `Record.ReadonlyRecord<K,V>`
- [ ] 1.5 Run `pnpm typecheck` and fix any errors
- [ ] 1.6 Run `pnpm lint` and fix any errors

## 2. Audit and Fix packages/cli

- [ ] 2.1 Search for `T[]` type annotations in packages/cli/src
- [ ] 2.2 Search for `ReadonlyArray<` and `readonly T[]` patterns in packages/cli/src
- [ ] 2.3 Search for `Record<` type annotations in packages/cli/src
- [ ] 2.4 Fix violations: replace with `Array.Array<T>` and `Record.ReadonlyRecord<K,V>`
- [ ] 2.5 Run `pnpm typecheck` and fix any errors
- [ ] 2.6 Run `pnpm lint` and fix any errors

## 3. Verify Chunk and HashMap Usage

- [ ] 3.1 Search for `Chunk` usage and verify appropriate (repeated concat or Streams)
- [ ] 3.2 Search for `HashMap` usage and verify appropriate (complex keys or value equality)
- [ ] 3.3 Document any violations found (if any)

## 4. Final Verification

- [ ] 4.1 Run `pnpm test` and fix any failures
- [ ] 4.2 Run `pnpm test:e2e` and fix any failures
- [ ] 4.3 Kill any vitest worker processes
