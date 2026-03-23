---
name: effect-filesystem
description: Effect filesystem and path patterns. Use when doing file I/O, reading/writing files, directory operations, or working with file paths.
user-invocable: false
---

# Effect Filesystem

All file I/O uses `effect/FileSystem` and all path computation uses
`effect/Path` — never `node:fs` or `node:path` in production code.
Both are Effect services provided by `NodeServices.layer` in the CLI runtime.

---

## Services

Both FileSystem and Path are obtained via `yield*` in an Effect generator:

```typescript
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Effect } from "effect";

const readConfig = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const configPath = path.join(dir, "config.json");
    const content = yield* fs.readFileString(configPath);
    return content;
  });
```

Dependencies appear in the `R` channel automatically — no explicit annotation
needed. Both are provided by `NodeServices.layer` (already wired in the CLI
runtime).

---

## FileSystem Operations

| Operation           | Method                                        |
| ------------------- | --------------------------------------------- |
| Read text file      | `fs.readFileString(path)`                     |
| Read binary file    | `fs.readFile(path)`                           |
| Write text file     | `fs.writeFileString(path, content)`           |
| Write binary file   | `fs.writeFile(path, data)`                    |
| Check existence     | `fs.exists(path)`                             |
| File/dir info       | `fs.stat(path)` (follows symlinks)            |
| List directory      | `fs.readDirectory(path)`                      |
| Create directory    | `fs.makeDirectory(path, { recursive: true })` |
| Remove file/dir     | `fs.remove(path, { recursive: true })`        |
| Create symlink      | `fs.symlink(target, link)`                    |
| Read symlink target | `fs.readLink(path)`                           |
| Resolve real path   | `fs.realPath(path)`                           |

---

## Path Operations

| Operation            | Method                         |
| -------------------- | ------------------------------ |
| Join segments        | `path.join("dir", "file.txt")` |
| Directory name       | `path.dirname(filePath)`       |
| Base name            | `path.basename(filePath)`      |
| Extension            | `path.extname(filePath)`       |
| Relative path        | `path.relative(from, to)`      |
| Resolve to absolute  | `path.resolve(base, target)`   |
| Check if absolute    | `path.isAbsolute(p)`           |
| Normalize (`.`/`..`) | `path.normalize(p)`            |
| Platform separator   | `path.sep`                     |
| Parse path segments  | `path.parse(p)`                |
| Format path object   | `path.format(obj)`             |

---

## Error Handling

Wrap `PlatformError` into domain errors at the call site:

```typescript
const content =
  yield *
  fs.readFileString(configPath).pipe(
    Effect.mapError(
      (error) =>
        new ConfigParseError({
          path: configPath,
          message: `Failed to read config: ${configPath}`,
          cause: error,
        }),
    ),
  );
```

For optional existence checks, use `Effect.option`:

```typescript
const maybeStat = yield * fs.stat(filePath).pipe(Effect.option);
if (Option.isSome(maybeStat)) {
  // file exists
}
```

---

## Testing

Provide `NodeServices.layer` (includes both FileSystem and Path):

```typescript
import { NodeServices } from "@effect/platform-node";

const withPlatform = <A, E>(effect: Effect.Effect<A, E, FileSystem | Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

it.effect("reads file", () =>
  withPlatform(
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const content = yield* fs.readFileString(testPath);
      expect(content).toBe("expected");
    }),
  ),
);
```

If only FileSystem is needed, `NodeFileSystem.layer` also works:

```typescript
import { NodeFileSystem } from "@effect/platform-node";

const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer));
```

Test setup/teardown with `node:fs` is acceptable — it runs outside Effect:

```typescript
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

beforeEach(() => {
  tmpDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "test-"));
});
afterEach(() => {
  nodeFs.rmSync(tmpDir, { recursive: true, force: true });
});
```

---

## Patterns

### Read + Parse + Validate

```typescript
const loadConfig = (configPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const content = yield* fs
      .readFileString(configPath)
      .pipe(Effect.mapError((e) => new ConfigError({ message: "Read failed", cause: e })));
    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (e) => new ConfigError({ message: "Parse failed", cause: e }),
    });
    return yield* Schema.decodeUnknown(ConfigSchema)(json).pipe(
      Effect.mapError((e) => new ConfigError({ message: "Validation failed", cause: e })),
    );
  });
```

### Recursive Directory Copy

```typescript
const copyDir = (src: string, dest: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    yield* fs.makeDirectory(dest, { recursive: true });
    const entries = yield* fs.readDirectory(src);
    yield* Effect.forEach(
      entries,
      (name) => copyEntry(path.join(src, name), path.join(dest, name)),
      { concurrency: "unbounded" },
    );
  });
```

### Ensure Directory Exists Before Write

```typescript
const path = yield * Path;
yield * fs.makeDirectory(path.dirname(filePath), { recursive: true });
yield * fs.writeFileString(filePath, content);
```

---

## Effect Filesystem Checklist

- [ ] **No `node:fs` in production** — Use `effect/FileSystem` for all I/O
- [ ] **No `node:path` in production** — Use `effect/Path` for path computation
- [ ] **Domain errors** — Wrap `PlatformError` via `mapError` at each call site
- [ ] **NodeServices.layer in tests** — Provides both FileSystem and Path
- [ ] **Concurrent directory ops** — Use `Effect.forEach` with concurrency for parallel I/O
- [ ] **Recursive mkdir** — Always pass `{ recursive: true }` when creating parent dirs
- [ ] **Node APIs in test setup only** — `node:fs`/`node:path` acceptable in beforeEach/afterEach
