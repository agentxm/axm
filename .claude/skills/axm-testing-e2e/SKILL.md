---
name: axm-testing-e2e
description: E2E test patterns for CLI subprocess tests. Covers both co-located (dev-time) and distribution (built artifact) E2E tests.
user-invocable: false
---

# E2E Testing Patterns

Two levels of E2E testing:

| Level | Location | Tests what | Runs when |
|---|---|---|---|
| **Co-located** | `packages/cli/src/**/*.e2e.test.ts` | Source via `bun run src/main.ts` | Every PR |
| **Distribution** | `packages/<cli>-e2e/` | Built artifact via `dist/` | After build, before release |

---

## Co-located E2E Tests

Dev-time regression tests co-located with command handlers.

Import from `./utils.js`:

```typescript
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";
```

| Helper                | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `runCli(args, opts)`  | Run CLI, returns `{ exitCode, stdout, stderr }` |
| `createTempDir()`     | Create temp dir, returns `{ path, cleanup }`    |
| `SKILLS_REPO_FIXTURE` | Path to test fixture with sample skills         |

---

## Distribution E2E Tests

Separate Nx project that tests the **built artifact** — no source imports.

### Structure

```
packages/
  cli-spike-e2e/          # type:e2e — depends on cli-spike:build
    project.json          # e2e target with dependsOn: [cli-spike:build]
    vitest.config.ts      # 30s timeout, *.e2e.test.ts pattern
    src/
      utils.ts            # Spawns dist/src/main.js, not source
      smoke.e2e.test.ts   # --help, --version, exit codes
```

### Running

```bash
pnpm nx e2e cli-spike-e2e    # Builds cli-spike first, then runs tests
```

### Utilities

Import from `./utils.js`:

```typescript
import { createTempDir, runCli } from "./utils.js";
```

| Helper                         | Purpose                                         |
| ------------------------------ | ----------------------------------------------- |
| `runCli(args, opts)`           | Run **built** CLI, returns `{ exitCode, stdout, stderr }` |
| `createTempDir(prefix?)`      | Create temp dir, returns `{ path, cleanup }`    |

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

### What distribution E2E catches that co-located can't

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
- [ ] **Nx dependency** — Distribution `e2e` target uses `dependsOn: ["<cli>:build"]`
