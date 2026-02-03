## 1. Update Tests for Optional Fields

- [ ] 1.1 Update settings.test.ts to expect all fields as optional
- [ ] 1.2 Update test for createDefaultSettings to expect empty object `{}`
- [ ] 1.3 Add test cases for functions handling undefined `agents` and `skills`
- [ ] 1.4 Run typecheck, lint, and tests, fix any issues
- [ ] 1.5 Kill any runaway vitest worker processes

## 2. Remove Duplicate Type Definition

- [ ] 2.1 Remove `Settings` interface from `skills/types.ts` (lines 93-106)
- [ ] 2.2 Run typecheck, lint, and tests, fix any issues
- [ ] 2.3 Kill any runaway vitest worker processes

## 3. Consolidate Schema Usage

- [ ] 3.1 Remove local `SettingsSchema` from `skills/settings.ts` (lines 21-28)
- [ ] 3.2 Import `Settings` schema from `../schemas/settings.js`
- [ ] 3.3 Import `type { Settings }` from `../schemas/settings.js`
- [ ] 3.4 Update `readSettings` to use canonical schema for validation
- [ ] 3.5 Run typecheck, lint, and tests, fix any issues
- [ ] 3.6 Kill any runaway vitest worker processes

## 4. Update Default Settings

- [ ] 4.1 Update `createDefaultSettings()` to return `{}`
- [ ] 4.2 Run typecheck, lint, and tests, fix any issues
- [ ] 4.3 Kill any runaway vitest worker processes

## 5. Handle Optional Fields in Functions

- [ ] 5.1 Update `addSkill` to handle undefined `skills` field
- [ ] 5.2 Update `updateSettings` to handle undefined `skills` field
- [ ] 5.3 Update any other functions accessing `agents` or `skills` directly
- [ ] 5.4 Run typecheck, lint, and tests, fix any issues
- [ ] 5.5 Kill any runaway vitest worker processes

## 6. Final Verification

- [ ] 6.1 Run full test suite (`pnpm test`)
- [ ] 6.2 Run typecheck (`pnpm typecheck`)
- [ ] 6.3 Run lint (`pnpm lint`)
- [ ] 6.4 Kill any runaway vitest worker processes
