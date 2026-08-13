import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

const settingsPath = (root: string): string => path.join(root, ".axm", "settings.json");

describe("global directory flag", () => {
  it("runs setup in the selected directory and resolves relative arguments from there", async () => {
    const invoking = createTempDir("axm-directory-invoking-");
    const workspace = createTempDir("axm-directory-workspace-");
    try {
      const setup = await runCli(["-C", workspace.path, "setup", "--yes", "--non-interactive"], {
        cwd: invoking.path,
      });

      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      expect(fs.existsSync(settingsPath(workspace.path))).toBe(true);
      expect(fs.existsSync(settingsPath(invoking.path))).toBe(false);

      fs.mkdirSync(path.join(invoking.path, ".axm"));
      fs.writeFileSync(settingsPath(invoking.path), "not json");

      const lint = await runCli(["-C", workspace.path, "lint", ".", "--json"], {
        cwd: invoking.path,
      });
      const findings: ReadonlyArray<{ readonly ruleId: string }> = JSON.parse(lint.stdout).result
        .findings;

      expect(findings.some((finding) => finding.ruleId === "workspace/settings-schema-valid")).toBe(
        false,
      );
    } finally {
      invoking.cleanup();
      workspace.cleanup();
    }
  });

  it("uses the first duplicate directory and leaves cwd unchanged when the flag is absent", async () => {
    const invoking = createTempDir("axm-directory-default-");
    const first = createTempDir("axm-directory-first-");
    const second = createTempDir("axm-directory-second-");
    try {
      const duplicate = await runCli(
        ["--directory", first.path, "-C", second.path, "setup", "--yes", "--non-interactive"],
        { cwd: invoking.path },
      );

      expect(duplicate.exitCode, duplicate.stdout + duplicate.stderr).toBe(0);
      expect(fs.existsSync(settingsPath(first.path))).toBe(true);
      expect(fs.existsSync(settingsPath(second.path))).toBe(false);

      const defaulted = await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: invoking.path,
      });

      expect(defaulted.exitCode, defaulted.stdout + defaulted.stderr).toBe(0);
      expect(fs.existsSync(settingsPath(invoking.path))).toBe(true);
    } finally {
      invoking.cleanup();
      first.cleanup();
      second.cleanup();
    }
  });

  it("reports invalid and unusable directories as usage errors", async () => {
    const invoking = createTempDir("axm-directory-errors-");
    const restricted = createTempDir("axm-directory-restricted-");
    const file = path.join(invoking.path, "not-a-directory");
    const missing = path.join(invoking.path, "missing");
    fs.writeFileSync(file, "file");
    fs.chmodSync(restricted.path, 0o600);

    try {
      for (const directory of [missing, file, restricted.path]) {
        const result = await runCli(["-C", directory, "status", "--json"], {
          cwd: invoking.path,
        });

        expect(result.exitCode, result.stdout + result.stderr).toBe(2);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "usage" });
      }
    } finally {
      fs.chmodSync(restricted.path, 0o700);
      invoking.cleanup();
      restricted.cleanup();
    }
  });
});
