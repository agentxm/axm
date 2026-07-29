/**
 * Unit tests for `composePath`.
 *
 * Covers the four `displayRoot` cases from `agentxm-internal/docs/design/lint-engine.md`
 * "Diagnostic path rendering":
 *
 * | Caller                      | `displayRoot`                                  |
 * | --------------------------- | ---------------------------------------------- |
 * | Registry publish            | `""`                                           |
 * | `axm lint` — registry skill | `".axm/extensions/<@owner>/skills/<name>/src"` |
 * | `axm lint` — external skill | `".axm/extensions/external/skills/<name>"`     |
 * | `axm lint` — workspace rule | `""`                                           |
 */

import { describe, expect, it } from "vitest";
import { composePath } from "./compose-path.js";
import type { FindingLocation } from "./rule.js";

const loc = (overrides: Partial<FindingLocation> = {}): FindingLocation => ({
  file: "SKILL.md",
  ...overrides,
});

describe("composePath", () => {
  describe("registry publish displayRoot (empty string)", () => {
    it("renders accessor root-file as ./file", () => {
      expect(composePath("", loc())).toBe("./SKILL.md");
    });

    it("appends line when present", () => {
      expect(composePath("", loc({ line: 1 }))).toBe("./SKILL.md:1");
    });

    it("appends line:column when both present", () => {
      expect(composePath("", loc({ line: 12, column: 3 }))).toBe("./SKILL.md:12:3");
    });

    it("omits column when line is absent", () => {
      expect(composePath("", loc({ column: 3 }))).toBe("./SKILL.md");
    });

    it("renders missing location as ./", () => {
      expect(composePath("", undefined)).toBe(".");
    });
  });

  describe("axm lint — registry-installed skill displayRoot", () => {
    const root = ".axm/extensions/@acme/skills/axm/src";

    it("joins displayRoot with location file", () => {
      expect(composePath(root, loc())).toBe("./.axm/extensions/@acme/skills/axm/src/SKILL.md");
    });

    it("appends line", () => {
      expect(composePath(root, loc({ line: 1 }))).toBe(
        "./.axm/extensions/@acme/skills/axm/src/SKILL.md:1",
      );
    });
  });

  describe("axm lint — external (non-native) skill displayRoot", () => {
    const root = ".axm/extensions/external/skills/foo";

    it("joins displayRoot with location file", () => {
      expect(composePath(root, loc())).toBe("./.axm/extensions/external/skills/foo/SKILL.md");
    });

    it("appends line", () => {
      expect(composePath(root, loc({ line: 1 }))).toBe(
        "./.axm/extensions/external/skills/foo/SKILL.md:1",
      );
    });
  });

  describe("axm lint — workspace-scope displayRoot (empty string)", () => {
    it("renders settings file relative to workspace root", () => {
      expect(composePath("", loc({ file: ".axm/settings.json" }))).toBe("./.axm/settings.json");
    });
  });

  describe("edge cases", () => {
    it("strips trailing slash from displayRoot", () => {
      expect(composePath(".axm/extensions/@acme/skills/axm/src/", loc())).toBe(
        "./.axm/extensions/@acme/skills/axm/src/SKILL.md",
      );
    });

    it("strips leading slash from location file", () => {
      expect(composePath("", loc({ file: "/SKILL.md" }))).toBe("./SKILL.md");
    });

    it("handles empty location file (finding targets context root)", () => {
      expect(composePath("", loc({ file: "" }))).toBe(".");
    });

    it("handles empty location file with a displayRoot", () => {
      expect(composePath(".axm/extensions/@acme/skills/axm/src", loc({ file: "" }))).toBe(
        "./.axm/extensions/@acme/skills/axm/src",
      );
    });
  });
});
