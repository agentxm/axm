---
name: testing-handler
description: Handler test patterns with mock services. Use when writing tests in packages/cli/src/commands/__tests__/.
user-invocable: false
---

# Handler Testing Patterns

Handler tests verify Effect handlers with mock service layers. Location:
`packages/cli/src/commands/**/__tests__/*.test.ts`

---

## Pattern

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInit, type InitArgs } from "../init.handler.js";

describe("init.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to run handler with real FileSystem layer
  const runHandler = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem>,
  ) => Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

  // Helper for error assertions
  const runHandlerEither = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem>,
  ) =>
    Effect.runPromise(
      effect.pipe(Effect.either, Effect.provide(NodeFileSystem.layer)),
    );

  const defaultArgs: InitArgs = { global: false, agent: [], yes: false };

  it("creates settings.json", async () => {
    const args: InitArgs = { ...defaultArgs, yes: true };

    await runHandler(handleInit(args));

    const settingsPath = path.join(tempDir, ".axm", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it("handles already-initialized case", async () => {
    // Pre-create settings
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({ version: 1, agents: ["claude-code"], skills: {} }),
    );

    const result = await runHandlerEither(
      handleInit({ ...defaultArgs, yes: true }),
    );

    expect(result._tag).toBe("Right");
  });
});
```

---

## Checklist

- [ ] **Fresh temp directory** — Create in `beforeEach`, clean up in `afterEach`
- [ ] **Provide Effect layers** — All dependencies via test layers
- [ ] **Reset cwd** — Save and restore `process.cwd()` if changing it
- [ ] **Error paths tested** — Verify error handling with failing services
- [ ] **Effect.either for errors** — Use `Effect.either` to assert on failures
