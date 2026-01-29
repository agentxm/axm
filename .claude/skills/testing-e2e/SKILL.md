---
name: testing-e2e
description: E2E test patterns for CLI subprocess tests. Use for packages/cli/e2e/*.test.ts. Tests full CLI binary with file system.
user-invocable: false
---

# E2E Testing Patterns

E2E tests spawn the CLI as a subprocess and verify end-to-end behavior. Location:
`packages/cli/e2e/*.test.ts`

---

## Utilities

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

## Pattern

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";

describe("axm skills add", () => {
  it("installs skills and creates .axm structure", async () => {
    const temp = createTempDir();
    try {
      // Initialize first
      await runCli(["init", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      // Install skills
      const result = await runCli(
        [
          "skills",
          "add",
          SKILLS_REPO_FIXTURE,
          "--all",
          "--yes",
          "--agent",
          "claude-code",
        ],
        { cwd: temp.path },
      );

      // Verify CLI output
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Successfully installed");

      // Verify file system state
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      expect(fs.existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.skills).toHaveProperty("my-skill");
    } finally {
      temp.cleanup();
    }
  });

  it("lists available skills with --list", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      const result = await runCli(
        [
          "skills",
          "add",
          SKILLS_REPO_FIXTURE,
          "--list",
          "--agent",
          "claude-code",
        ],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("my-skill");
      expect(result.stdout).toMatch(/\d+ skill\(s\) available/);
    } finally {
      temp.cleanup();
    }
  });
});
```

---

## Checklist

- [ ] **Use `createTempDir()`** — Fresh directory per test, call `cleanup()` in finally
- [ ] **Initialize first** — Run `init --yes --agent` before other commands
- [ ] **Specify `--agent`** — Avoid interactive prompts in tests
- [ ] **Exit codes verified** — Assert `exitCode` is 0 for success, 1 for errors
- [ ] **stdout/stderr checked** — Verify user-facing output
- [ ] **File system verified** — Check files created/modified after command
- [ ] **Use fixtures** — Local paths in `packages/cli/e2e/fixtures/`, no network
