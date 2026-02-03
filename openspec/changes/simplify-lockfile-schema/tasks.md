## 1. Update Schema Tests (Red)

- [ ] 1.1 Update lockfile schema tests with new flat structure scenarios
- [ ] 1.2 Add test for valid GitHub source with flat fields
- [ ] 1.3 Add test for valid local source with flat fields
- [ ] 1.4 Add test for valid registry source with flat fields
- [ ] 1.5 Add test for invalid source type rejection
- [ ] 1.6 Add test for missing required fields per source type

## 2. Implement Flat Schema (Green)

- [ ] 2.1 Define source type literal union schema (`"github" | "git" | "local" | "registry"`)
- [ ] 2.2 Define flat GitHub source schema with required/optional fields
- [ ] 2.3 Define flat Git source schema with required/optional fields
- [ ] 2.4 Define flat Local source schema with required/optional fields
- [ ] 2.5 Define flat Registry source schema with required/optional fields
- [ ] 2.6 Create union schema with `source` as discriminator
- [ ] 2.7 Update SkillLockEntrySchema to use new flat structure
- [ ] 2.8 Remove old nested source schemas (LocalSourceSchema, GitSourceSchema, GitHubSourceSchema, RegistrySourceSchema)
- [ ] 2.9 Run typecheck and fix any issues
- [ ] 2.10 Run lint and fix any issues
- [ ] 2.11 Run tests and fix any failures
- [ ] 2.12 Kill any runaway vitest worker processes

## 3. Update Lockfile Operations

- [ ] 3.1 Update lockfile read/write operations if they reference old source structure
- [ ] 3.2 Update any source type checks or pattern matches
- [ ] 3.3 Run typecheck and fix any issues
- [ ] 3.4 Run lint and fix any issues
- [ ] 3.5 Run tests and fix any failures
- [ ] 3.6 Kill any runaway vitest worker processes

## 4. Update Consumers

- [ ] 4.1 Find and update CLI code that constructs lock entries
- [ ] 4.2 Find and update any code that reads source fields
- [ ] 4.3 Run typecheck and fix any issues
- [ ] 4.4 Run lint and fix any issues
- [ ] 4.5 Run tests and fix any failures
- [ ] 4.6 Kill any runaway vitest worker processes

## 5. Final Verification

- [ ] 5.1 Run full test suite (`pnpm test`)
- [ ] 5.2 Run E2E tests (`pnpm test:e2e`)
- [ ] 5.3 Kill any runaway vitest worker processes
