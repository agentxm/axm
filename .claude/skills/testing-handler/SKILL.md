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
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { handleInit, type InitArgs } from "./init.handler.js";

describe("init.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  // Fresh temp directory per test
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to provide FileSystem layer
  const withFs = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  const defaultArgs: InitArgs = { global: false, agent: [], yes: false };

  it.effect("creates settings.json", () =>
    withFs(
      Effect.gen(function* () {
        yield* handleInit({ ...defaultArgs, yes: true });

        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
      }),
    ),
  );

  it.effect("handles already-initialized case", () =>
    withFs(
      Effect.gen(function* () {
        // Pre-create settings
        fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
        fs.writeFileSync(
          path.join(tempDir, ".axm", "settings.json"),
          JSON.stringify({ version: 1, agents: ["claude-code"], skills: {} }),
        );

        const result = yield* handleInit({ ...defaultArgs, yes: true });
        expect(result).toBeDefined();
      }),
    ),
  );

  it.effect("fails with InvalidConfig for bad settings", () =>
    withFs(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
        fs.writeFileSync(
          path.join(tempDir, ".axm", "settings.json"),
          "not json",
        );

        const error = yield* handleInit({ ...defaultArgs, yes: true }).pipe(
          Effect.flip,
        );
        expect(error._tag).toBe("InvalidConfig");
      }),
    ),
  );
});
```

---

## Checklist

- [ ] **Fresh temp directory** — Create in `beforeEach`, clean up in `afterEach`
- [ ] **Reset cwd** — Save and restore `process.cwd()` if changing it
- [ ] **Provide layers** — All Effect dependencies via test layers
- [ ] **Effect.flip for errors** — Use flip to assert on expected failures
- [ ] **Error paths tested** — Verify error handling with test layers that simulate failures
