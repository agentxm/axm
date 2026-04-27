/**
 * Tests for the per-source tagged error families used by WorkspaceReadModel
 * source-backed cells.
 *
 * Mix of runtime checks (instantiation, tag narrowing) and pure type-level
 * assertions (exact-union membership, non-membership of provider-construction
 * errors).
 */

import { describe, expect, it } from "vitest";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  WorkspaceRootEscape,
  type LockfileReadError,
  type SettingsReadError,
} from "../errors.js";

// Compile-time exact-union assertions live in `errors.type-test.ts` so they
// run under typecheck without registering empty vitest specs.

// ---------------------------------------------------------------------------
// Runtime instantiation and tag narrowing
// ---------------------------------------------------------------------------

describe("workspace-context per-source error families", () => {
  describe("SettingsIoError", () => {
    it("instantiates with path and cause and exposes the SettingsIoError tag", () => {
      const cause = new Error("ENOENT");
      const err = new SettingsIoError({
        path: "/ws/.axm/settings.json",
        cause,
      });
      expect(err._tag).toBe("SettingsIoError");
      expect(err.path).toBe("/ws/.axm/settings.json");
      expect(err.cause).toBe(cause);
    });
  });

  describe("SettingsParseError", () => {
    it("instantiates with path, raw text, and cause and exposes the SettingsParseError tag", () => {
      const cause = new SyntaxError("Unexpected token }");
      const err = new SettingsParseError({
        path: "/ws/.axm/settings.json",
        raw: "{ this is not json",
        cause,
      });
      expect(err._tag).toBe("SettingsParseError");
      expect(err.path).toBe("/ws/.axm/settings.json");
      expect(err.raw).toBe("{ this is not json");
      expect(err.cause).toBe(cause);
    });
  });

  describe("SettingsDecodeError", () => {
    it("instantiates with path, decode issues, and raw decoded value and exposes the SettingsDecodeError tag", () => {
      const issues = ["expected `{ skills: ... }`, got string"] as const;
      const raw = { unexpected: "shape" };
      const err = new SettingsDecodeError({
        path: "/ws/.axm/settings.json",
        issues,
        raw,
      });
      expect(err._tag).toBe("SettingsDecodeError");
      expect(err.path).toBe("/ws/.axm/settings.json");
      expect(err.issues).toEqual(issues);
      expect(err.raw).toBe(raw);
    });
  });

  describe("LockfileIoError", () => {
    it("instantiates with path and cause and exposes the LockfileIoError tag", () => {
      const cause = new Error("EACCES");
      const err = new LockfileIoError({
        path: "/ws/axm-lock.yaml",
        cause,
      });
      expect(err._tag).toBe("LockfileIoError");
      expect(err.path).toBe("/ws/axm-lock.yaml");
      expect(err.cause).toBe(cause);
    });
  });

  describe("LockfileParseError", () => {
    it("instantiates with path, raw text, and cause and exposes the LockfileParseError tag", () => {
      const cause = new Error("YAMLException: bad indentation");
      const err = new LockfileParseError({
        path: "/ws/axm-lock.yaml",
        raw: "skills:\n  - bad\n - indentation",
        cause,
      });
      expect(err._tag).toBe("LockfileParseError");
      expect(err.path).toBe("/ws/axm-lock.yaml");
      expect(err.raw).toBe("skills:\n  - bad\n - indentation");
      expect(err.cause).toBe(cause);
    });
  });

  describe("LockfileDecodeError", () => {
    it("instantiates with path, decode issues, and raw decoded value and exposes the LockfileDecodeError tag", () => {
      const issues = ["expected `version`, got undefined"] as const;
      const raw = { skills: [] };
      const err = new LockfileDecodeError({
        path: "/ws/axm-lock.yaml",
        issues,
        raw,
      });
      expect(err._tag).toBe("LockfileDecodeError");
      expect(err.path).toBe("/ws/axm-lock.yaml");
      expect(err.issues).toEqual(issues);
      expect(err.raw).toBe(raw);
    });
  });

  describe("WorkspaceRootEscape", () => {
    it("instantiates with workspaceRoot and allowedRoot and exposes the WorkspaceRootEscape tag", () => {
      const err = new WorkspaceRootEscape({
        workspaceRoot: "/ws/../escape",
        allowedRoot: "/ws",
      });
      expect(err._tag).toBe("WorkspaceRootEscape");
      expect(err.workspaceRoot).toBe("/ws/../escape");
      expect(err.allowedRoot).toBe("/ws");
    });
  });

  describe("Tagged error narrowing", () => {
    it("narrows SettingsReadError by tag to the corresponding payload shape", () => {
      const errs: ReadonlyArray<SettingsReadError> = [
        new SettingsIoError({ path: "/p", cause: new Error("io") }),
        new SettingsParseError({ path: "/p", raw: "{", cause: new SyntaxError("x") }),
        new SettingsDecodeError({ path: "/p", issues: ["bad"], raw: {} }),
      ];

      for (const err of errs) {
        switch (err._tag) {
          case "SettingsIoError": {
            expect(typeof err.path).toBe("string");
            // `cause` is unknown; assert presence only.
            expect("cause" in err).toBe(true);
            break;
          }
          case "SettingsParseError": {
            expect(typeof err.raw).toBe("string");
            break;
          }
          case "SettingsDecodeError": {
            expect(Array.isArray(err.issues)).toBe(true);
            break;
          }
        }
      }
    });

    it("narrows LockfileReadError by tag to the corresponding payload shape", () => {
      const errs: ReadonlyArray<LockfileReadError> = [
        new LockfileIoError({ path: "/p", cause: new Error("io") }),
        new LockfileParseError({ path: "/p", raw: "x:", cause: new Error("y") }),
        new LockfileDecodeError({ path: "/p", issues: ["bad"], raw: {} }),
      ];

      for (const err of errs) {
        switch (err._tag) {
          case "LockfileIoError": {
            expect(typeof err.path).toBe("string");
            expect("cause" in err).toBe(true);
            break;
          }
          case "LockfileParseError": {
            expect(typeof err.raw).toBe("string");
            break;
          }
          case "LockfileDecodeError": {
            expect(Array.isArray(err.issues)).toBe(true);
            break;
          }
        }
      }
    });
  });
});
