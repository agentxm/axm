# Phase 4: Registry Commands Smoke Test Results

**Date:** 2026-03-23
**Commands tested:** `skills new`, `skills fork`, `skills publish`
**Method:** CLI subprocess via `bun run packages/cli/src/main.ts` in temp directories

---

## 4.1 `skills new`

### Test Results

| #   | Test               | Command                                               | Exit | Result                                                                             |
| --- | ------------------ | ----------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- |
| 1   | Help flag          | `axm skills new --help`                               | 0    | PASS — shows usage, flags, examples                                                |
| 2   | Scaffold new skill | `axm skills new my-skill --yes` (profile=@test)       | 0    | PASS — manifest, src/SKILL.md, settings entry, agent symlink all created correctly |
| 3   | Profile override   | `axm skills new custom-skill --profile @custom --yes` | 0    | PASS — manifest shows `@custom`, extension dir under `@custom/skills/`             |
| 4   | Already exists     | `axm skills new my-skill --yes` (second time)         | 1    | PASS — `SKILL_ALREADY_EXISTS`, "already exists in settings"                        |

**Verification details (test 2):**

- `axm-skill.json`: `{"profile":"@test","type":"skill","name":"my-skill","version":"0.0.1"}`
- `src/SKILL.md`: frontmatter with `name: my-skill`
- Settings: `skills.my-skill` present
- Symlink: `.claude/skills/my-skill -> ../../.axm/extensions/@test/skills/my-skill/src`

**All `skills new` tests pass. No errors found.**

---

## 4.2 `skills fork`

### Test Results

| #   | Test                                      | Command                                                        | Exit | Result                                                                         |
| --- | ----------------------------------------- | -------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| 1   | Help flag                                 | `axm skills fork --help`                                       | 0    | PASS — shows usage, --skill flag, examples                                     |
| 2   | Fork from local source                    | `axm skills fork <fixture> --yes`                              | 0    | PASS — both my-skill and another-skill forked, published, installed            |
| 3   | Fork with --skill glob                    | `axm skills fork <fixture> --skill "*-skill" --yes`            | 0    | PASS — matched both skills                                                     |
| 4   | Fork on-disk skills                       | `axm skills fork "ondisk-*" --yes` (skills in .claude/skills/) | 0    | PASS — both ondisk-alpha and ondisk-beta forked                                |
| 5   | No-match glob                             | `axm skills fork "zzz-*" --yes`                                | 1    | PASS — `NO_SKILLS_MATCHED`, lists available candidates                         |
| 6   | Fork installed skill                      | `axm skills fork my-skill --yes` (already forked)              | 0    | PASS — re-forks, re-publishes, re-installs                                     |
| 7   | Fork with built-in registry (no explicit) | `axm skills fork test-skill --yes --non-interactive`           | 0    | PARTIAL — fork + install succeed but publish fails with 401 to remote registry |

### Observations

**Test 7 detail:** Without an explicit `file://` registry configured, the fork command uses the built-in "default" registry at `https://registry.agentxm.ai/`. The publish step fails with `AUTH_UNAUTHENTICATED` (401), but the fork still reports exit 0 because it counts "2 applied, 1 failed" and doesn't propagate the publish failure as a command-level error. The install step also succeeds despite the failed publish, which means it installs from the local extension copy, not from the registry.

**Lockfile issues (tests 2-4, 6):** After fork, the lockfile shows:

- `integrity: ""` — empty string instead of the actual SHA-512 hash
- `sourceName: default` — hardcoded fallback instead of the actual registry name (e.g., "local")

---

## 4.3 `skills publish`

### Test Results

| #   | Test                                                   | Command                                                                               | Exit        | Result                                                             |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| 1   | Help flag                                              | `axm skills publish --help`                                                           | 0           | PASS — shows usage, --registry flag, examples                      |
| 2   | Publish to local registry                              | `axm skills publish @test/skills/my-pub-skill --yes` (AXM_TOKEN set)                  | 0           | PASS — index.json + 1.0.0.zip created in registry                  |
| 3   | Bare name (profile from settings)                      | `axm skills publish code-review --yes`                                                | 0           | PASS — resolved @test profile, published to registry               |
| 4   | Nonexistent extension                                  | `axm skills publish @test/skills/nonexistent-skill --yes`                             | 1           | PASS — `EXTENSION_NOT_FOUND`, shows expected path                  |
| 5   | Glob pattern                                           | `axm skills publish "effect-*" --yes`                                                 | 0           | PASS — published effect-basics and effect-stream, skipped commit   |
| 6   | Multiple literal names                                 | `axm skills publish skill-a skill-b --yes`                                            | 0           | PASS — both published                                              |
| 7   | No-match glob                                          | `axm skills publish "nonexistent-*" --yes`                                            | 0           | PASS — "No skills matched pattern", exits cleanly                  |
| 8   | Registry guard (no explicit registry, non-interactive) | `axm skills publish @test/skills/my-skill --yes --non-interactive` (no AXM_TOKEN)     | 1           | PASS — `AUTH_LOGIN_REQUIRED` from auth guard                       |
| 9   | Registry guard (no explicit registry, with AXM_TOKEN)  | `axm skills publish @test/skills/my-skill --yes` (no explicit registry)               | 1           | PASS — fails with `PUBLISH_SKILL_PUBLISH_FAILED` (401 to remote)   |
| 10  | Auth guard device flow hang                            | `axm skills publish @test/skills/my-skill --yes` (no AXM_TOKEN, no --non-interactive) | 1 (timeout) | ISSUE — initiates device code flow in non-TTY, polls until timeout |

### Registry artifact verification (test 2):

- `index.json`: name, profile, type, versions array with version/published/integrity
- `integrity`: `sha512-9j24+D8Tsn...` (valid SHA-512 base64)
- `1.0.0.zip`: 380 bytes, valid ZIP magic bytes (PK/0x50 0x4b)

---

## Error Catalog

### FORK-1: Empty integrity in lockfile after fork

- **Command:** `axm skills fork <fixture> --yes` (with file:// registry)
- **Expected:** Lockfile `integrity` field contains SHA-512 hash matching the published archive
- **Actual:** Lockfile shows `integrity: ""` (empty string)
- **Root Cause:** In `packages/cli/src/cli-commands/skills/fork/handler.ts:269`, the `registryRef` is constructed with `integrity: ""` as a placeholder before the publish step runs. The install step then persists this empty value to the lockfile. The publish operation computes the real integrity and stores it in the registry `index.json`, but this value is never back-propagated to the `registryRef` used by the install step.
- **Category:** handler
- **Severity:** major — the lockfile cannot be used for integrity verification, defeating the purpose of content-addressable archives

### FORK-2: Wrong sourceName in lockfile after fork

- **Command:** `axm skills fork <fixture> --yes` (with file:// registry named "local")
- **Expected:** Lockfile `sourceName` field is `"local"` (matching the configured registry source)
- **Actual:** Lockfile shows `sourceName: "default"`
- **Root Cause:** The fork handler determines the correct `registryName` at line 245 (`registrySource.name`), but only passes it to the `publish-skill` operation (line 289). The `install-skill` operation (line 298-308) builds a `registryRef` with `source.type: "registry"` but `source.profile: Option.none()`, and the install operation calls `sourceToLockEntry` with `sourceName: Option.none()` (in `packages/cli/src/extensions/skills/operations/install.ts:490`). The `sourceToLockEntry` function falls back to `"default"` when `sourceName` is `None` (in `packages/cli/src/sources/source-to-lock-entry.ts:132`).
- **Category:** handler
- **Severity:** major — the lockfile references the wrong registry source, which would cause update/reinstall to use the wrong registry

### FORK-3: Fork exits 0 despite failed publish step

- **Command:** `axm skills fork test-skill --yes --non-interactive` (no explicit registry, uses built-in default)
- **Expected:** Non-zero exit when a plan step fails, or clear indication that partial success occurred
- **Actual:** Exit 0, output shows "2 applied, 1 failed"
- **Root Cause:** The fork handler at `packages/cli/src/cli-commands/skills/fork/handler.ts:319-325` calls `ws.resolvePlan()` which executes the plan but does not check for failed steps afterward (unlike the publish handler which checks `resolvedPlan.jobs...step.result.result === "error"` at lines 233-247). The fork handler just logs "Done" after `resolvePlan` returns.
- **Category:** handler
- **Severity:** major — silent failures in a multi-step workflow can leave the workspace in an inconsistent state

### PUBLISH-1: Auth guard device flow triggers in non-TTY with --yes

- **Command:** `axm skills publish @test/skills/my-skill --yes` (no AXM_TOKEN, piped/non-TTY stdin)
- **Expected:** Either detect non-TTY automatically and fail fast with `AUTH_LOGIN_REQUIRED`, or skip the device flow
- **Actual:** The `--yes` flag auto-accepts the "Sign in now?" prompt (line 91-92 of `packages/cli/src/auth/guard.ts`), which triggers `inlineLogin()` (line 100). The device code flow starts polling for browser approval, which will never come in a non-TTY context. Eventually times out with `AUTH_LOGIN_FAILED`.
- **Root Cause:** The auth guard checks `flags.nonInteractive` (line 84) to fail fast, but the non-interactive auto-detection (from `!stdin.isTTY` or `CI=true`) only applies when `--non-interactive` was not explicitly passed. With `--yes` alone, the guard treats the session as interactive and proceeds with the device flow even though the user can't see/use the browser URL. The `--yes` flag is supposed to "Auto-accept confirmation prompts" but the login flow is more than a simple confirmation -- it requires browser interaction.
- **Category:** handler
- **Severity:** minor — workaround is to always use `--non-interactive` in CI or set `AXM_TOKEN`. Only affects publish, not fork (fork doesn't use auth guard).

### INSTALL-1: InstallSkillCommandWorkflowActions service not found

- **Command:** `axm skills install <fixture> --skill my-skill --yes`
- **Expected:** Exit 0, skill installed
- **Actual:** Exit 1, "Service not found: InstallSkillCommandWorkflowActions"
- **Root Cause:** The install command requires `InstallSkillCommandWorkflowActionsLive` layer to be provided, but the command runtime layer wiring in `packages/cli/src/commands/skills/install.ts` does not include it. This is a known pre-existing issue from Phase 1 (not new to Phase 4), but it impacts fork-from-installed-skill workflows since you can't install first.
- **Category:** handler
- **Severity:** blocker — `skills install` is completely non-functional from the CLI. However, fork can bypass this by using local source paths directly.

---

## Summary

| Command          | Tests | Pass | Fail | Issues                                                                 |
| ---------------- | ----- | ---- | ---- | ---------------------------------------------------------------------- |
| `skills new`     | 4     | 4    | 0    | None                                                                   |
| `skills fork`    | 7     | 5    | 2    | FORK-1, FORK-2, FORK-3 (lockfile integrity/sourceName, silent failure) |
| `skills publish` | 10    | 9    | 1    | PUBLISH-1 (auth guard device flow in non-TTY)                          |
| `skills install` | 1     | 0    | 1    | INSTALL-1 (pre-existing, service not found)                            |

### Error Severity Breakdown

| Severity | Count | IDs                      |
| -------- | ----- | ------------------------ |
| Blocker  | 1     | INSTALL-1 (pre-existing) |
| Major    | 3     | FORK-1, FORK-2, FORK-3   |
| Minor    | 1     | PUBLISH-1                |

### Key Findings

1. **`skills new` is solid** -- all tests pass, scaffolding, profile override, and duplicate detection all work correctly.

2. **`skills fork` works functionally but has lockfile fidelity issues** -- the fork/publish/install pipeline succeeds end-to-end, but the lockfile entries have empty `integrity` and wrong `sourceName`. This is because the fork handler pre-builds the `registryRef` before publish runs (so integrity is unknown) and doesn't propagate the registry name to the install step.

3. **`skills publish` works well** -- FQN, bare name, glob, multi-literal, and no-match glob all behave correctly. The auth guard correctly blocks unauthenticated access in non-interactive mode. The only issue is the `--yes` flag triggering a device flow in non-TTY contexts.

4. **`skills install` is blocked** by a missing service layer (INSTALL-1), which is a pre-existing issue. This doesn't block fork/publish testing since fork can work with local sources directly.

5. **The fork handler doesn't check for failed plan steps** (FORK-3), unlike the publish handler which explicitly checks and reports failures. This inconsistency means fork can silently swallow publish failures.
