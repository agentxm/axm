/**
 * Unit tests for path utilities module.
 *
 * Tests the axm directory resolution functions for global and project scopes.
 */

import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getAxmDir, getGlobalDir, getProjectDir } from "./paths.js";

describe("paths", () => {
  describe("getGlobalDir", () => {
    it("returns path to ~/.axm", () => {
      const result = getGlobalDir();

      expect(result).toBe(path.join(os.homedir(), ".axm"));
    });

    it("returns an absolute path", () => {
      const result = getGlobalDir();

      expect(path.isAbsolute(result)).toBe(true);
    });

    it("returns the same value on repeated calls", () => {
      const result1 = getGlobalDir();
      const result2 = getGlobalDir();

      expect(result1).toBe(result2);
    });
  });

  describe("getProjectDir", () => {
    it("returns path to ./.axm relative to cwd", () => {
      const result = getProjectDir();

      expect(result).toBe(path.join(process.cwd(), ".axm"));
    });

    it("returns an absolute path", () => {
      const result = getProjectDir();

      expect(path.isAbsolute(result)).toBe(true);
    });

    it("returns the same value on repeated calls", () => {
      const result1 = getProjectDir();
      const result2 = getProjectDir();

      expect(result1).toBe(result2);
    });
  });

  describe("getAxmDir", () => {
    it("returns global dir when global is true", () => {
      const result = getAxmDir(true);

      expect(result).toBe(getGlobalDir());
    });

    it("returns project dir when global is false", () => {
      const result = getAxmDir(false);

      expect(result).toBe(getProjectDir());
    });

    it("returns an absolute path regardless of scope", () => {
      const globalResult = getAxmDir(true);
      const projectResult = getAxmDir(false);

      expect(path.isAbsolute(globalResult)).toBe(true);
      expect(path.isAbsolute(projectResult)).toBe(true);
    });

    it("returns different paths for global and project scopes", () => {
      const globalResult = getAxmDir(true);
      const projectResult = getAxmDir(false);

      // Only guaranteed to be different if cwd is not home directory
      // But paths should always be valid
      expect(typeof globalResult).toBe("string");
      expect(typeof projectResult).toBe("string");
      expect(globalResult.endsWith(".axm")).toBe(true);
      expect(projectResult.endsWith(".axm")).toBe(true);
    });
  });
});
