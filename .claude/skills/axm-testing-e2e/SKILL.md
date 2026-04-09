---
name: axm-testing-e2e
description: E2E test patterns for built CLI artifacts, plus when a reference spike may keep a local subprocess smoke test.
user-invocable: false
---

# E2E Testing Patterns

Default to distribution E2E tests for shipped CLIs. The only local subprocess
exception is the reference spike, which keeps `packages/cli-spike/src/main.test.ts`
as a teaching/smoke test.

| Level            | Location                              | Tests what                       | Runs when                       |
| ---------------- | ------------------------------------- | -------------------------------- | ------------------------------- |
| **Spike smoke**  | `packages/cli-spike/src/main.test.ts` | Source via `bun run src/main.ts` | Reference-app regression checks |
| **Distribution** | `packages/<cli>-e2e/`                 | Built artifact via `dist/`       | CI / release validation         |

---

## Spike Smoke Test

Use this only for the reference spike. Keep it focused on CLI behavior the
spike is explicitly teaching: help output, non-interactive paths, JSON support,
and telemetry/error routing.

Do not copy this pattern into shipped CLI packages. Those belong in
`packages/<cli>-e2e/`.

---

## Distribution E2E Tests

Separate Nx project that tests the **built artifact** — no source imports.

### Structure

```
packages/
  cli-spike-e2e/          # type:e2e — depends on cli-spike:compile
    project.json          # e2e target with dependsOn: [cli-spike:compile]
    vitest.config.ts      # 30s timeout, *.e2e.test.ts pattern
    src/
      utils.ts            # Spawns dist/src/main.js, not source
      smoke.e2e.test.ts   # --help, --version, exit codes
```

### Running

```bash
pnpm nx run cli-spike-e2e:e2e
```

### Utilities

Import from `./utils.js`:

```typescript
import { createTempDir, runCli } from "./utils.js";
```

| Helper                   | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `runCli(args, opts)`     | Run **built** CLI, returns `{ exitCode, stdout, stderr }` |
| `createTempDir(prefix?)` | Create temp dir, returns `{ path, cleanup }`              |

Key difference: `runCli` spawns `cli-spike/dist/src/main.js` (the build output), not source. Fails fast if the artifact doesn't exist.

### Pattern

```typescript
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./utils.js";

describe("cli-spike skills", () => {
  it("lists skills", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["skills", "list"], { cwd: temp.path });
      expect(result.exitCode).toBe(0);
    } finally {
      temp.cleanup();
    }
  });
});
```

### What distribution E2E catches that spike smoke tests cannot

- Build/bundle strips a dependency or tree-shakes needed code
- `bin` entry or `files` field misconfigured in package.json
- Entry point wiring broken after refactor
- Platform-specific issues (path handling, missing native deps)

---

## Checklist

- [ ] **Use `createTempDir()`** — Fresh directory per test, call `cleanup()` in finally
- [ ] **Exit codes verified** — Assert `exitCode` is 0 for success, non-zero for errors
- [ ] **stdout/stderr checked** — Verify user-facing output
- [ ] **File system verified** — Check files created/modified after command
- [ ] **No source imports** — Distribution tests must not import from the CLI package
- [ ] **Nx dependency** — Distribution `e2e` target uses `dependsOn: ["<cli>:compile"]` or the package's real build prerequisite
