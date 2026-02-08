## Context

The settings module (`packages/cli/src/settings/`) has accumulated several convention violations identified in code review:

1. Path construction via string concatenation instead of `@effect/platform` Path service
2. Dead `SettingsErrorTag` export with zero consumers
3. Optional `cause` on error types where it should be required
4. Type assertions (`as Settings`, `as SkillsMap`, `as AgentId`) bypassing validation
5. `workspace/service.ts` importing directly from `settings/settings.js` instead of the barrel
6. Duplicated skill-name validation filter in `ExtensionMapSchema` and `SkillsMapSchema`

All production code in this project uses `@effect/platform` for filesystem and path operations. The settings module is the only place still using string concatenation for paths.

## Goals / Non-Goals

**Goals:**

- Align settings module with project conventions (Effect platform, barrel exports, error patterns)
- Eliminate type assertions in favor of type-safe alternatives
- Validate inputs at service boundaries (addAgent)
- Remove dead code and deduplicate shared logic

**Non-Goals:**

- Changing the settings file format or schema
- Adding new service methods or capabilities
- Refactoring the workspace service beyond fixing the import path
- Backward compatibility with the removed `SettingsErrorTag` type

## Decisions

### 1. Add `Path.Path` dependency to `readSettings` / `writeSettings`

`getSettingsPath` currently uses string interpolation: `` `${axmDir}/${SETTINGS_FILENAME}` ``. This will change to use `Path.join` from `@effect/platform/Path`.

This adds `Path.Path` to the `R` channel of both functions. Since `Path.Path` is already provided by `NodeContext.layer` (wired in the CLI runtime), no layer composition changes are needed at the edges. The `SettingsServiceLive` layer will need to yield `Path.Path` and pass it through (or provide it via a layer like it does with `FileSystem`).

**Alternative considered**: Accepting a pre-joined path from the caller. Rejected because the current API takes `axmDir` and appends the filename internally — that's the right encapsulation, it just needs to use the platform path service.

### 2. Make `cause` required on `SettingsParseError` and `SettingsWriteError`

Both error types currently declare `cause?: unknown`. Every call site already provides `cause`. Making it required catches future omissions at compile time.

`SettingsNotFoundError` does not have `cause` because it represents a "file doesn't exist" condition — there's no underlying error to wrap.

### 3. Remove `SettingsErrorTag`

The type `"NotFound" | "ParseError" | "WriteError"` is exported but never imported anywhere. The discriminated union `SettingsError` and `_tag`-based matching provide the same capability. Straight deletion from `settings.ts` and `index.ts`.

### 4. Replace type assertions in `service.ts`

| Location              | Current              | Replacement                                                                                             |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `readOrCreate` return | `({}) as Settings`   | `createDefaultSettings()` (already returns `Settings`)                                                  |
| `getSkills` fallback  | `{} as SkillsMap`    | `{} satisfies SkillsMap`                                                                                |
| `addAgent` body       | `agentId as AgentId` | Validate with `Schema.decodeUnknown(AgentIdSchema)` and fail with `SettingsParseError` on invalid input |

For `addAgent`, the validation decode returns an `Either` — on failure, the service fails with a typed settings error. This makes the interface honest: if you pass an invalid agent ID, you get a clear error instead of silently writing invalid data to disk.

### 5. Fix barrel bypass in `workspace/service.ts`

`workspace/service.ts` imports `readSettings` and `writeSettings` directly from `../settings/settings.js`. These are already exported from the barrel (`../settings/index.js`). Change the import to use the barrel.

Confirm `readSettings` and `writeSettings` are in the barrel exports — they currently are not. They need to be added to `index.ts`.

### 6. Extract shared skill-name filter

`ExtensionMapSchema` and `SkillsMapSchema` both apply the identical `Schema.filter` that validates key names against `SKILL_NAME_PATTERN`. Extract this into a named function:

```typescript
const skillNameKeyFilter = Schema.filter((record: Record.ReadonlyRecord<string, string>) => {
  const invalidKeys = Object.keys(record).filter(
    (key) => key.length > 64 || !SKILL_NAME_PATTERN.test(key),
  );
  if (invalidKeys.length > 0) {
    return `Invalid skill name(s): ${invalidKeys.join(", ")}. ...`;
  }
  return undefined;
});
```

Both schemas then use `.pipe(skillNameKeyFilter)`. This keeps the validation logic in one place.

## Risks / Trade-offs

- **`Path.Path` in `R` channel** — Adding a service dependency to `readSettings`/`writeSettings` widens their type signatures. Callers that provide `FileSystem` must now also provide `Path.Path`. Since `NodeContext.layer` provides both, this is low risk for production code. Test helpers that provide `NodeFileSystem.layer` alone will need to also provide `NodePath.layer` (or just use `NodeContext.layer`).
  → Mitigation: `NodeContext.layer` already bundles both. Update test helpers to use it where needed.

- **`addAgent` validation** — Adding schema validation to `addAgent` is a behavior change. Code that previously passed arbitrary strings will now fail. This is intentional — invalid agent IDs should not be written to settings.
  → Mitigation: All current callers pass values from `AgentConfig.id` which are valid `AgentId` literals. No runtime breakage expected.

- **Removing `SettingsErrorTag`** — If any downstream consumer outside this repo imports it, this is breaking. Since this is an `@experimental` API and the type has zero in-repo consumers, the risk is negligible.
