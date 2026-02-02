## 1. Update Schema Tests (TDD)

- [ ] 1.1 Update settings.test.ts to expect flattened structure (skills, commands, packs, mcp-servers at root)
- [ ] 1.2 Remove tests for `extensions` wrapper object
- [ ] 1.3 Run typecheck and tests, verify tests fail (red phase)
- [ ] 1.4 Kill any runaway vitest worker processes

## 2. Update Settings Schema

- [ ] 2.1 Add skills, commands, packs, mcp-servers as optional ExtensionMap fields to Settings schema
- [ ] 2.2 Remove extensions field from Settings schema
- [ ] 2.3 Remove ExtensionsConfig schema (now unused)
- [ ] 2.4 Update Settings JSDoc to reflect new structure
- [ ] 2.5 Run typecheck and tests, verify tests pass (green phase)
- [ ] 2.6 Kill any runaway vitest worker processes

## 3. Update Consumers

- [ ] 3.1 Update lockfile.ts to read from flattened settings structure
- [ ] 3.2 Update skills/settings.ts to read from flattened settings structure
- [ ] 3.3 Update CLI handler code that accesses settings.extensions
- [ ] 3.4 Run typecheck and tests, fix any issues
- [ ] 3.5 Kill any runaway vitest worker processes

## 4. Update E2E Tests

- [ ] 4.1 Update init.test.ts settings fixtures to use flattened structure
- [ ] 4.2 Update skills-install.test.ts settings fixtures to use flattened structure
- [ ] 4.3 Run full test suite, verify all pass
- [ ] 4.4 Kill any runaway vitest worker processes

## 5. Regenerate JSON Schema

- [ ] 5.1 Run schema generation to update settings.schema.json
- [ ] 5.2 Verify generated schema reflects flattened structure
