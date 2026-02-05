## 1. Fix git.ts unsafe index access

- [x] 1.1 Replace `parts[2]` with `Array.get(parts, 2)` and handle Option in `packages/cli/src/extensions/skills/git.ts:185-186`

## 2. Fix clack-effect service.ts unsafe index access

- [x] 2.1 Replace `items[result]` with `Array.get(items, result)` in select function at line 131
- [x] 2.2 Replace `Option.fromNullable(items[index])` with `Array.get(items, index)` in multiselect at line 190

## 3. Fix state/types.ts unsafe index access

- [x] 3.1 Replace `v.issues[0]` with `Array.head(v.issues)` in getValidityCode at line 333

## 4. Verification

- [x] 4.1 Run typecheck (`pnpm typecheck`)
- [x] 4.2 Run linting (`pnpm lint`)
- [x] 4.3 Run tests (`pnpm test`)
- [x] 4.4 Run e2e tests (`pnpm test:e2e`)
- [x] 4.5 Kill any vitest worker processes
