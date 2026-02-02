/**
 * E2E tests for the `axm init` command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./utils.js";

describe("axm init", () => {
  describe("with --yes flag", () => {
    it("creates settings file in .axm directory", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        // Should exit successfully
        expect(result.exitCode).toBe(0);

        // Should create .axm directory
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(true);

        // Should create settings.json
        const settingsPath = path.join(axmDir, "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);

        // Settings should be valid JSON with new schema
        const settingsContent = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(settingsContent);
        expect(settings).toHaveProperty("agents");
        expect(settings).toHaveProperty("skills");
      } finally {
        temp.cleanup();
      }
    });

    it("outputs initialization message", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
        // Should indicate initialization occurred
        expect(result.stdout).toContain("init");
      } finally {
        temp.cleanup();
      }
    });

    it("handles already initialized directory", async () => {
      const temp = createTempDir();
      try {
        // First init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Second init should indicate already initialized
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Already initialized");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["init", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Initialize axm");
      expect(result.stdout).toContain("--global");
      expect(result.stdout).toContain("--agent");
      expect(result.stdout).toContain("--yes");
    });
  });
});
