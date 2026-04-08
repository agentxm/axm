import { describe, expect, it } from "vitest";
import { mapToolAccess } from "./tool-access-mapping.js";

describe("mapToolAccess", () => {
  describe("Claude Code", () => {
    it("omits fields for full access", () => {
      const result = mapToolAccess("full", "claude-code");
      expect(result.fields).toEqual({});
      expect(result.warnings).toEqual([]);
    });

    it("sets disallowedTools for readonly", () => {
      const result = mapToolAccess("readonly", "claude-code");
      expect(result.fields).toEqual({ disallowedTools: "Edit,Write,Bash" });
    });

    it("sets empty tools for none", () => {
      const result = mapToolAccess("none", "claude-code");
      expect(result.fields).toEqual({ tools: "" });
    });
  });

  describe("Copilot", () => {
    it("sets tools: ['*'] for full access", () => {
      expect(mapToolAccess("full", "github-copilot").fields).toEqual({ tools: ["*"] });
    });

    it("sets tools: ['read','search'] for readonly", () => {
      expect(mapToolAccess("readonly", "github-copilot").fields).toEqual({
        tools: ["read", "search"],
      });
    });

    it("sets tools: [] for none", () => {
      expect(mapToolAccess("none", "github-copilot").fields).toEqual({ tools: [] });
    });
  });

  describe("Codex", () => {
    it("omits fields for full access", () => {
      expect(mapToolAccess("full", "codex").fields).toEqual({});
    });

    it("sets sandbox_mode for readonly", () => {
      expect(mapToolAccess("readonly", "codex").fields).toEqual({
        sandbox_mode: "read-only",
      });
    });

    it("sets sandbox_mode for none with warning", () => {
      const result = mapToolAccess("none", "codex");
      expect(result.fields).toEqual({ sandbox_mode: "read-only" });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.feature).toBe("toolAccess");
    });
  });

  describe("Cursor", () => {
    it("omits fields for full access", () => {
      expect(mapToolAccess("full", "cursor").fields).toEqual({});
    });

    it("sets readonly for readonly", () => {
      expect(mapToolAccess("readonly", "cursor").fields).toEqual({ readonly: true });
    });

    it("sets readonly for none with warning", () => {
      const result = mapToolAccess("none", "cursor");
      expect(result.fields).toEqual({ readonly: true });
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("Roo Code", () => {
    it("sets full groups for full access", () => {
      expect(mapToolAccess("full", "roo-code").fields).toEqual({
        groups: ["read", "edit", "command", "mcp"],
      });
    });

    it("sets read+mcp groups for readonly", () => {
      expect(mapToolAccess("readonly", "roo-code").fields).toEqual({
        groups: ["read", "mcp"],
      });
    });

    it("sets read-only groups for none", () => {
      expect(mapToolAccess("none", "roo-code").fields).toEqual({
        groups: ["read"],
      });
    });
  });

  it("defaults to full when toolAccess is undefined", () => {
    const result = mapToolAccess(undefined, "claude-code");
    expect(result.fields).toEqual({});
  });

  it("returns empty fields for unknown agent", () => {
    const result = mapToolAccess("readonly", "unknown-agent");
    expect(result.fields).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});
