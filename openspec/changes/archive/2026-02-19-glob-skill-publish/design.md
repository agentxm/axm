## Context

`axm skills publish` currently accepts a single `<extension>` positional argument — either an FQN (`@scope/skills/name`) or a bare name resolved via project scope. The FQN is parsed and validated before publishing. When the input contains a glob character (e.g., `effect-*`), FQN parsing fails because `*` is not a valid FQN character.

Glob expansion already exists in the codebase (`expandGlob`, `expandGlobs`, `isGlobPattern` in `skills/glob.ts`) and is used by install, fork, uninstall, and update commands. The publish handler needs to follow the same pattern.

Managed extensions are tracked in settings via `getInstalledSkills()` which returns a `Record<string, NormalizedSkillEntry>` where keys are skill names (bare names like `effect-basics`, not FQNs). These correspond to directories under `.axm/extensions/<namespace>/skills/<name>/`.

## Goals / Non-Goals

**Goals:**

- Accept glob patterns in the `extension` positional (e.g., `axm skills publish "effect-*"`)
- Accept multiple positional arguments (e.g., `axm skills publish "effect-*" commit`)
- Expand patterns against managed (installed) skill names from settings
- Build a multi-step plan with one `PublishSkillOperation` per matched skill
- Follow the same glob expansion patterns used by uninstall, fork, and update

**Non-Goals:**

- Glob expansion against non-managed (unmanaged) skills — only managed skills are publishable
- Regex or advanced glob syntax (`?`, `[a-z]`, `{a,b}`) — only `*` wildcards, matching existing behavior
- `--skill` flag — publish uses positional args directly, not a separate filter flag

## Decisions

### 1. Expand globs against installed skill names from settings

**Choice:** Use `Workspace.getInstalledSkills()` keys as the expansion universe.

**Why:** Managed extensions are tracked in settings with `managed: true`. This is the authoritative source for which skills are publishable. It's also consistent with how update uses `getInstalledSkills()` to find updateable skills.

**Alternative considered:** Scan `.axm/extensions/` filesystem directories. Rejected because settings is the source of truth — a directory could exist without being registered in settings.

### 2. Variadic positional arguments

**Choice:** Change `<extension>` from a single required positional to a variadic `<extensions..>` that accepts one or more patterns.

**Why:** This matches the user's mental model (`publish "effect-*" commit`) and is consistent with how other CLIs handle batch operations. yargs supports variadic positionals via array type.

### 3. Glob detection before FQN parsing

**Choice:** Check `isGlobPattern()` on each input before attempting FQN parsing. If the input is a glob, expand it against installed skill names first, then resolve each matched name to an FQN.

**Why:** FQN parsing rejects `*` characters. The expansion must happen at the bare-name level, then each resolved name gets scope-prefixed and FQN-parsed as today.

### 4. Single plan with concurrent publish steps

**Choice:** Build one plan with all matched extensions as separate `PublishSkillOperation` steps in a single job. Use `concurrency: 1` initially (sequential publishing to avoid registry race conditions).

**Why:** The existing plan/confirm/apply pattern handles multi-step plans cleanly. Users see a preview of all skills being published and can confirm once.

## Risks / Trade-offs

- **No matches is a warning, not an error** — consistent with uninstall behavior. If all inputs are globs and none match, warn and exit cleanly. If a literal name doesn't match, include it in the plan (the publish executor will fail with `EXTENSION_NOT_FOUND`, giving a clear error per-skill).
- **Scope resolution happens once** — all bare names share the same project scope. This is fine because managed extensions all live under the configured scope.
