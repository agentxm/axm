## Context

Local source parsing was restored in commit 6e30472, but the CLI handler rejects local sources at line 685-690:

```typescript
} else if (parsed.type === "git" || parsed.type === "registry" || parsed.type === "local") {
  return yield* new InstallError({
    message: `Source type "${parsed.type}" is not yet supported`,
```

All the pieces exist:

- `parseSource()` correctly identifies local paths and sets `parsed.type === "local"` and `parsed.localPath`
- `discoverSkills(directory)` scans a directory for SKILL.md files and returns `Skill[]`
- E2e tests exist but fail because the handler rejects local sources

## Goals / Non-Goals

**Goals:**

- Implement local source handling in the install handler
- Make existing e2e tests pass
- Follow the same pattern as git source handling

**Non-Goals:**

- Edge case coverage (deep nesting, symlinks in source, permission errors)
- Windows-specific path handling
- Mixed source operations (local + remote)

## Implementation

### Handler Change

In `packages/cli/src/commands/skills/install/handler.ts`, replace the rejection at lines 685-690:

```typescript
// BEFORE (rejects local sources)
} else if (parsed.type === "git" || parsed.type === "registry" || parsed.type === "local") {
  if (showOutput) spinnerHelper.stop("Source type not yet supported");
  return yield* new InstallError({
    message: `Source type "${parsed.type}" is not yet supported`,
    retryable: false,
  });
}

// AFTER (handles local sources, still rejects git/registry)
} else if (parsed.type === "local") {
  // Local sources: discover skills directly from the filesystem path
  const skillsDir = parsed.localPath!;
  skills = yield* discoverSkills(skillsDir).pipe(
    Effect.mapError(
      (error) =>
        new InstallError({
          message: formatError(
            `Failed to discover skills: ${error.message}`,
            [`Path: ${skillsDir}`],
            "Verify the path exists and contains directories with SKILL.md files.",
          ),
          cause: error,
          retryable: false,
        }),
    ),
  );
  resolvedSource = { parsed, skillsDir };
} else if (parsed.type === "git" || parsed.type === "registry") {
  // ... existing rejection for git/registry
}
```

### Key Points

1. **No cloning needed** - local sources already exist on disk
2. **Use `parsed.localPath`** - already resolved to absolute path by `parseSource()`
3. **No `commitSha`** - `ResolvedSource.commitSha` is optional, omit for local sources
4. **Same skill discovery** - reuse `discoverSkills()` that git sources use after cloning

## Risks / Trade-offs

**Risk**: `parsed.localPath` might be undefined for malformed local sources → Mitigation: Add defensive check, though parser should always set it for `type === "local"`
