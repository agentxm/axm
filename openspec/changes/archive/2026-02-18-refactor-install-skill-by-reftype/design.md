## Context

`installSkill` in `install-skill.ts` is a single ~100-line `Effect.gen` that handles all four ref types (`git-hosted`, `registry`, `local`, `builtin`) through interleaved conditionals:

- `getRefLocation` branches on `git-hosted || local` (inline location) vs others (fetch via SourceHostProviders)
- `pathSource` ternary selects registry vs non-registry path layout
- `useExistingCanonical` special-cases registry refs with empty integrity (fork/publish pipeline)
- `copyTarget` ternary picks `canonicalPath` (registry) vs `skillSrcPath` (others)
- `isSelfCopy` detects when source already equals target
- `versionConstraint` ternary selects registry vs `Option.none()`

Each conditional is small on its own, but together they obscure what actually happens for each ref type. A reader must mentally thread through all branches to understand a single installation path.

## Goals / Non-Goals

**Goals:**

- Each ref type reads as a self-contained, top-to-bottom pipeline
- Shared post-install logic (agent symlinks, state writes) extracted once
- No change to external contract (`OperationHandler`, `OperationResult`)

**Non-Goals:**

- Changing the operation args or ref type hierarchy
- Changing file layout conventions (canonical paths, symlink targets)
- Performance optimization
- Backward compatibility with any internal API shape

## Decisions

### 1. Add `baseDir` property to Workspace

`const base = path.dirname(ws.path)` is repeated ~21 times across the codebase. Add a `baseDir` property to `WorkspaceContextService` that returns the project root (parent of `.axm`). This eliminates the need to yield `Path` just to compute the project root, and removes `base` from every function signature.

```typescript
// WorkspaceContextService
readonly baseDir: string  // path.dirname(this.path) — project root
```

### 2. `validatePathSafety` helper

Wraps `isPathSafe` check + `CliError` fail into a single call used by all per-refType functions.

```typescript
const validatePathSafety = (baseDir: string, targetPath: string) =>
  isPathSafe(baseDir, targetPath)
    ? Effect.void
    : makeCliError({
        code: "INSTALL_SKILL_PATH_TRAVERSAL",
        what: `Path traversal detected: ${targetPath}`,
      });
```

### 3. Top-level switch dispatch

Each `ref.refType` case produces a `MaterializedSkill` — the inputs needed by shared post-install steps. This replaces all scattered conditionals with one explicit branch point.

```
type MaterializedSkill = {
  skillSrcPath: string      // symlink target for agents
  versionConstraint: Option<string>
}
```

**Pseudocode:**

```typescript
export const installSkill: OperationHandler<...> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace
    const log = yield* Log
    const { ref } = op.args
    const agents = yield* ws.getConfiguredAgents()
    const sanitizedName = sanitizeName(ref.skill.name)

    // ── Per-refType: resolve source, copy to canonical ──────────────
    const materialized = yield* (() => {
      switch (ref.refType) {
        case "git-hosted":
          return installFromGitHosted(ref, sanitizedName)
        case "registry":
          return installFromRegistry(ref, sanitizedName, op.args.versionConstraint)
        case "local":
          return installFromLocal(ref, sanitizedName)
        case "builtin":
          return installFromBuiltin(ref, sanitizedName)
      }
    })()

    // ── Shared: symlink to agents ───────────────────────────────────
    const agentResults = yield* Effect.forEach(
      agents,
      (agentId) => installForAgent({ agentId, canonicalSkillSrcPath: materialized.skillSrcPath, sanitizedName }),
      { concurrency: "unbounded" },
    )

    // ── Shared: update lockfile + settings ──────────────────────────
    const lockEntry = sourceToLockEntry({ ref, agents, now: new Date() })
    const skillArgs = { name: ref.skill.name, lockEntry, versionConstraint: materialized.versionConstraint }
    const writeEffect = op.args.skipSettings ? ws.setSkillLock(skillArgs) : ws.setSkill(skillArgs)
    yield* writeEffect.pipe(Effect.catchAll((e) => log.warn(`Skill update failed: ${String(e)}`)))

    // ── Shared: compute result ──────────────────────────────────────
    const anyFailed = agentResults.some((r) => !r.success)
    if (anyFailed) {
      const failedAgents = agentResults.filter((r) => !r.success).map(...)
      return { result: "error", message: `Failed for some agents: ${failedAgents.join(", ")}` }
    }
    return { result: "success", message: `Installed ${ref.skill.name}` }
  })
```

**Alternative considered:** Keep a single function with `if/else` blocks instead of a switch. Rejected because the switch makes exhaustiveness explicit and each case is visually isolated.

### 4. Per-refType install functions

Each function is fully effectful — it yields its own dependencies from the Effect context rather than receiving them as parameters. Each encapsulates: path resolution, validation, pre-clean, source fetch (if needed), and copy. Returns `MaterializedSkill`.

```typescript
// ── git-hosted ──────────────────────────────────────────────────────
const installFromGitHosted = (ref: GitHostedSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    const sourcePath = stripFileProtocol(ref.location);
    yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);

    return { skillSrcPath, versionConstraint: Option.none() } satisfies MaterializedSkill;
  });

// ── registry ────────────────────────────────────────────────────────
const installFromRegistry = (
  ref: RegistrySkillRef,
  sanitizedName: string,
  versionConstraint: Option<string>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: "registry",
      namespace: ref.scope,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    // Synthetic refs (fork/publish) may have empty integrity — use existing canonical
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(Effect.orElseSucceed(() => false));
    const useExisting = ref.integrity === "" && canonicalExists;

    if (!useExisting) {
      // Use registry client directly: fetch archive, verify integrity, extract
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* createRegistryClient(locationStr);
      const { archive } = yield* client.getExtensionPackage({
        namespace: ref.scope,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

      const actualIntegrity = yield* computeIntegrity(archive);
      if (actualIntegrity !== ref.integrity) {
        yield* makeCliError({
          code: "INSTALL_SKILL_INTEGRITY_MISMATCH",
          what: `Integrity mismatch for ${ref.name}@${ref.version}`,
          details: [`Expected ${ref.integrity}, got ${actualIntegrity}`],
        });
      }

      const tmpDir = yield* fs.makeTempDirectory();
      yield* extractZip(archive, tmpDir);
      yield* preCleanAndCopy(sanitizedName, tmpDir, canonicalPath);
      yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
    }

    return { skillSrcPath, versionConstraint } satisfies MaterializedSkill;
  });

// ── local ───────────────────────────────────────────────────────────
const installFromLocal = (ref: LocalSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    const sourcePath = stripFileProtocol(ref.location);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(skillSrcPath);
    if (!isSelfCopy) {
      yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);
    }

    return { skillSrcPath, versionConstraint: Option.none() } satisfies MaterializedSkill;
  });

// ── builtin ─────────────────────────────────────────────────────────
const installFromBuiltin = (ref: BuiltinSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    const sourcePath = yield* fetchSource(ref);
    yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);

    return { skillSrcPath, versionConstraint: Option.none() } satisfies MaterializedSkill;
  });
```

**Alternative considered:** A single `materialize` function with a switch inside that returns different config objects. Rejected because registry has genuinely different logic (existing canonical check, scoped paths, version constraints) that would still require conditionals inside.

### 5. Shared pre-clean + copy helper

Also effectful — yields its own `FileSystem` and `Path` dependencies.

```typescript
const preCleanAndCopy = (sanitizedName: string, sourcePath: string, copyTarget: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    yield* removeFromAllCanonicalLocations(fs, ws.baseDir, sanitizedName, path);
    yield* copySkillDirectory(sourcePath, copyTarget).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "INSTALL_SKILL_COPY_FAILED",
          what: `Failed to copy skill files to ${copyTarget}`,
          cause: e,
        }),
      ),
    );
  });
```

### 6. Shared source fetch helper (builtin only)

Only `builtin` still uses the generic `SourceHostProviders.fetch`. `git-hosted` and `local` have inline locations; `registry` uses the registry client directly.

```typescript
const fetchSource = (ref: BuiltinSkillRef) =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders
    const files = yield* sources.fetch(ref).pipe(Effect.mapError(...), Effect.scoped)
    return files.directory
  })
```

### 7. `installForAgent` — drop `base` param, rename `canonicalPath` → `canonicalSkillSrcPath`

The agent symlink logic is already isolated and works for all ref types identically. Changes: remove `base` from its parameter object (yield `Workspace` instead), and rename `canonicalPath` to `canonicalSkillSrcPath` to accurately reflect that it receives the skill source path, not the top-level canonical path.

```typescript
const installForAgent = (opts: {
  readonly agentId: string;
  readonly canonicalSkillSrcPath: string;
  readonly sanitizedName: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const agentSkillPath = path.join(ws.baseDir, agent.skills.dir, opts.sanitizedName);
    // symlink/copy targets use opts.canonicalSkillSrcPath
    // ... rest unchanged
  });
```

## Risks / Trade-offs

- **Some duplication across cases** (path resolution, validation calls) → Acceptable trade-off for readability. Each case is ~10-15 lines and reads independently.
- **git-hosted and local are similar** → Could share logic, but keeping them separate preserves the exhaustive switch pattern and allows future divergence (e.g., git-hosted might add integrity verification).
- **Test structure** → Existing tests exercise behavior (copy, symlink, lockfile) not internals, so they should pass with minimal changes. New internal functions don't need separate unit tests since behavior is covered.
