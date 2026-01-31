---
name: testing-handler
description: Handler test patterns requiring Effect test layers. Use when testing handlers (effectful entry points) that need service dependencies.
user-invocable: false
---

# Handler Testing Patterns

Handlers are effectful entry points that require services provided via layers.
This skill covers patterns for testing handlers. Location: colocated with source
(e.g., `packages/cli/src/**/*.test.ts`).

For Effect testing patterns (it.effect, error assertions, providing layers),
see `/effect-testing`.

---

## Pattern

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FetchHttpClient } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { type AddArgs, handleAdd } from "./handler.js";

// Multi-service layer using Layer.mergeAll
const TestLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  FetchHttpClient.layer,
);

describe("add.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  // Fresh temp directory per test
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const defaultArgs: AddArgs = { source: "", global: false, agent: [] };

  it.effect("installs skill to canonical location", () =>
    Effect.gen(function* () {
      yield* handleAdd({ ...defaultArgs, source: "./skills", yes: true });

      const skillPath = path.join(tempDir, ".axm", "skills", "commit");
      expect(fs.existsSync(skillPath)).toBe(true);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("fails with AddError for invalid source", () =>
    Effect.gen(function* () {
      const error = yield* handleAdd({ ...defaultArgs, source: "" }).pipe(
        Effect.flip,
      );
      expect(error._tag).toBe("AddError");
    }).pipe(Effect.provide(TestLayer)),
  );
});
```

For handlers with timestamp checks or elapsed time measurements, use `it.live`:

```typescript
it.live("updates the updatedAt timestamp", () =>
  Effect.gen(function* () {
    yield* handleUpdate(args);
    const mtime = fs.statSync(lockPath).mtimeMs;
    expect(mtime).toBeGreaterThan(Date.now() - 1000);
  }).pipe(Effect.provide(TestLayer)),
);
```

---

## Checklist

- [ ] **Fresh temp directory** — Create in `beforeEach`, clean up in `afterEach`
- [ ] **Reset cwd** — Save and restore `process.cwd()` if changing it
- [ ] **Provide layers** — All Effect dependencies via test layers
- [ ] **Effect.flip for errors** — Use flip to assert on expected failures
- [ ] **Error paths tested** — Verify error handling with test layers that simulate failures
