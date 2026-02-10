## 1. Core Lockfile Module

- [x] 1.1 Update lockfile.ts constants: change `LOCKFILE_NAME` from `axm.lock` to `axm-lock.yaml`
- [x] 1.2 Update lockfile.ts imports: add `import YAML from "yaml"`
- [x] 1.3 Update lockfile.ts `readLockfile`: replace `JSON.parse` with `YAML.parse`
- [x] 1.4 Update lockfile.ts `writeLockfile`: replace `JSON.stringify` with `YAML.stringify`
- [x] 1.5 Update lockfile.ts JSDoc comments to reference YAML format
- [x] 1.6 Update lockfile.test.ts: change all `axm.lock` references to `axm-lock.yaml`
- [x] 1.7 Run typecheck and tests for core package, fix any issues
- [x] 1.8 Kill any runaway vitest worker processes

## 2. Handler Tests

- [x] 2.1 Update handler.ts comment referencing `axm.lock` to `axm-lock.yaml`
- [x] 2.2 Update handler.test.ts: change all `axm.lock` references to `axm-lock.yaml`
- [x] 2.3 Update handler.test.ts: change JSON.parse to YAML.parse for lockfile content assertions
- [x] 2.4 Run typecheck and tests for cli package, fix any issues
- [x] 2.5 Kill any runaway vitest worker processes

## 3. E2E Tests

- [x] 3.1 Update skills-install.test.ts: change all `axm.lock` references to `axm-lock.yaml`
- [x] 3.2 Update skills-install.test.ts: change JSON.parse to YAML.parse for lockfile assertions
- [x] 3.3 Update skills-install.test.ts comments referencing JSON format to YAML
- [x] 3.4 Run E2E tests, fix any issues
- [x] 3.5 Kill any runaway vitest worker processes

## 4. Final Verification

- [x] 4.1 Run full test suite (`pnpm test`)
- [x] 4.2 Run typecheck (`pnpm typecheck`)
- [x] 4.3 Run format (`pnpm format`)
- [x] 4.4 Kill any runaway vitest worker processes
