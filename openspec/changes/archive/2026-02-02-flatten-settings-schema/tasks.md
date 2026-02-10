## 1. Update Schema Tests (TDD)

- [x] 1.1 Update settings.test.ts to expect flattened structure (skills, commands, packs, mcp-servers at root)
- [x] 1.2 Remove tests for `extensions` wrapper object
- [x] 1.3 Run typecheck and tests, verify tests fail (red phase)
- [x] 1.4 Kill any runaway vitest worker processes

## 2. Update Settings Schema

- [x] 2.1 Add skills, commands, packs, mcp-servers as optional ExtensionMap fields to Settings schema
- [x] 2.2 Remove extensions field from Settings schema
- [x] 2.3 Remove ExtensionsConfig schema (now unused)
- [x] 2.4 Update Settings JSDoc to reflect new structure
- [x] 2.5 Run typecheck and tests, verify tests pass (green phase)
- [x] 2.6 Kill any runaway vitest worker processes

## 3. Update Consumers

- [x] 3.1 Update lockfile.ts to read from flattened settings structure
- [x] 3.2 Update skills/settings.ts to read from flattened settings structure
- [x] 3.3 Update CLI handler code that accesses settings.extensions
- [x] 3.4 Run typecheck and tests, fix any issues
- [x] 3.5 Kill any runaway vitest worker processes

## 4. Update E2E Tests

- [x] 4.1 Update init.test.ts settings fixtures to use flattened structure
- [x] 4.2 Update skills-install.test.ts settings fixtures to use flattened structure
- [x] 4.3 Run full test suite, verify all pass
- [x] 4.4 Kill any runaway vitest worker processes

## 5. Regenerate JSON Schema

- [x] 5.1 Run schema generation to update settings.schema.json
- [x] 5.2 Verify generated schema reflects flattened structure
