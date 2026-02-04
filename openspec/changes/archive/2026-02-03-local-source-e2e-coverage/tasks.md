## 1. Implement Local Source Handling

- [x] 1.1 Add local source branch to handler at line 685 in `packages/cli/src/commands/skills/install/handler.ts`
- [x] 1.2 Call `discoverSkills(parsed.localPath!)` for local sources
- [x] 1.3 Set `resolvedSource = { parsed, skillsDir }` (no commitSha for local)

## 2. Verify Implementation

- [x] 2.1 Run local source e2e tests to verify they pass
- [x] 2.2 Run typecheck, fix any errors
- [x] 2.3 Run linting, fix any errors

## 3. Full Verification

- [x] 3.1 Run full test suite to ensure no regressions
- [x] 3.2 Kill any vitest worker processes
