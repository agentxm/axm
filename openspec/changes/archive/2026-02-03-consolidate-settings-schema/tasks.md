## 1. Update Tests for Optional Fields

- [x] 1.1 Update settings.test.ts to expect all fields as optional
- [x] 1.2 Update test for createDefaultSettings to expect empty object `{}`
- [x] 1.3 Add test cases for functions handling undefined `agents` and `skills`
- [x] 1.4 Run typecheck, lint, and tests, fix any issues
- [x] 1.5 Kill any runaway vitest worker processes

## 2. Remove Duplicate Type Definition

- [x] 2.1 Remove `Settings` interface from `skills/types.ts` (lines 93-106)
- [x] 2.2 Run typecheck, lint, and tests, fix any issues
- [x] 2.3 Kill any runaway vitest worker processes

## 3. Consolidate Schema Usage

- [x] 3.1 Remove local `SettingsSchema` from `skills/settings.ts` (lines 21-28)
- [x] 3.2 Import `Settings` schema from `../schemas/settings.js`
- [x] 3.3 Import `type { Settings }` from `../schemas/settings.js`
- [x] 3.4 Update `readSettings` to use canonical schema for validation
- [x] 3.5 Run typecheck, lint, and tests, fix any issues
- [x] 3.6 Kill any runaway vitest worker processes

## 4. Update Default Settings

- [x] 4.1 Update `createDefaultSettings()` to return `{}`
- [x] 4.2 Run typecheck, lint, and tests, fix any issues
- [x] 4.3 Kill any runaway vitest worker processes

## 5. Handle Optional Fields in Functions

- [x] 5.1 Update `addSkill` to handle undefined `skills` field
- [x] 5.2 Update `updateSettings` to handle undefined `skills` field
- [x] 5.3 Update any other functions accessing `agents` or `skills` directly
- [x] 5.4 Run typecheck, lint, and tests, fix any issues
- [x] 5.5 Kill any runaway vitest worker processes

## 6. Final Verification

- [x] 6.1 Run full test suite (`pnpm test`)
- [x] 6.2 Run typecheck (`pnpm typecheck`)
- [x] 6.3 Run lint (`pnpm lint`)
- [x] 6.4 Kill any runaway vitest worker processes
