## 1. Update Schema Tests (Red)

- [x] 1.1 Update lockfile schema tests with new flat structure scenarios
- [x] 1.2 Add test for valid GitHub source with flat fields
- [x] 1.3 Add test for valid local source with flat fields
- [x] 1.4 Add test for valid registry source with flat fields
- [x] 1.5 Add test for invalid source type rejection
- [x] 1.6 Add test for missing required fields per source type

## 2. Implement Flat Schema (Green)

- [x] 2.1 Define source type literal union schema (`"github" | "git" | "local" | "registry"`)
- [x] 2.2 Define flat GitHub source schema with required/optional fields
- [x] 2.3 Define flat Git source schema with required/optional fields
- [x] 2.4 Define flat Local source schema with required/optional fields
- [x] 2.5 Define flat Registry source schema with required/optional fields
- [x] 2.6 Create union schema with `source` as discriminator
- [x] 2.7 Update SkillLockEntrySchema to use new flat structure
- [x] 2.8 Remove old nested source schemas (LocalSourceSchema, GitSourceSchema, GitHubSourceSchema, RegistrySourceSchema)
- [x] 2.9 Run typecheck and fix any issues
- [x] 2.10 Run lint and fix any issues
- [x] 2.11 Run tests and fix any failures
- [x] 2.12 Kill any runaway vitest worker processes

## 3. Update Lockfile Operations

- [x] 3.1 Update lockfile read/write operations if they reference old source structure
- [x] 3.2 Update any source type checks or pattern matches
- [x] 3.3 Run typecheck and fix any issues
- [x] 3.4 Run lint and fix any issues
- [x] 3.5 Run tests and fix any failures
- [x] 3.6 Kill any runaway vitest worker processes

## 4. Update Consumers

- [x] 4.1 Find and update CLI code that constructs lock entries
- [x] 4.2 Find and update any code that reads source fields
- [x] 4.3 Run typecheck and fix any issues
- [x] 4.4 Run lint and fix any issues
- [x] 4.5 Run tests and fix any failures
- [x] 4.6 Kill any runaway vitest worker processes

## 5. Final Verification

- [x] 5.1 Run full test suite (`pnpm test`)
- [x] 5.2 Run E2E tests (`pnpm test:e2e`)
- [x] 5.3 Kill any runaway vitest worker processes
