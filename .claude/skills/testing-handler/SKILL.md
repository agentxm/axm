---
name: testing-handler
description: Handler test patterns with test layers. Use when writing tests in packages/cli/src/.
user-invocable: false
---

# Handler Testing Patterns

Handler tests verify Effect handlers with test layers. Location:
`packages/cli/src/**/*.test.ts` (colocated with handlers)

For Effect testing patterns (running effects, error assertions, providing
layers), see `/effect-testing`.

---

## Pattern

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  // Helpers - see /effect-testing for patterns
  const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

  const runEither = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem>,
  ) =>
    Effect.runPromise(
      effect.pipe(Effect.either, Effect.provide(NodeFileSystem.layer)),
    );

  const defaultArgs: InitArgs = { global: false, agent: [], yes: false };

  it("creates settings.json", async () => {
    await run(handleInit({ ...defaultArgs, yes: true }));

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

    const result = await runEither(handleInit({ ...defaultArgs, yes: true }));

    expect(result._tag).toBe("Right");
  });
});
```

---

## Checklist

- [ ] **Fresh temp directory** — Create in `beforeEach`, clean up in `afterEach`
- [ ] **Reset cwd** — Save and restore `process.cwd()` if changing it
- [ ] **Provide layers** — All Effect dependencies via test layers
- [ ] **Error paths tested** — Verify error handling with test layers that simulate failures
