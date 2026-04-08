import { describe, expect, it } from "vitest";
import { mapModelTier } from "./model-mapping.js";

describe("mapModelTier", () => {
  it("returns undefined when model is undefined", () => {
    const result = mapModelTier(undefined, "claude-code");
    expect(result.value).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  describe("Claude Code", () => {
    it("maps fast to haiku", () => {
      expect(mapModelTier("fast", "claude-code").value).toBe("haiku");
    });

    it("maps default to inherit", () => {
      expect(mapModelTier("default", "claude-code").value).toBe("inherit");
    });

    it("maps powerful to opus", () => {
      expect(mapModelTier("powerful", "claude-code").value).toBe("opus");
    });

    it("maps inherit to inherit", () => {
      expect(mapModelTier("inherit", "claude-code").value).toBe("inherit");
    });

    it("passes through concrete model IDs", () => {
      expect(mapModelTier("claude-opus-4-6", "claude-code").value).toBe("claude-opus-4-6");
    });
  });

  describe("Cursor", () => {
    it("maps fast to fast", () => {
      expect(mapModelTier("fast", "cursor").value).toBe("fast");
    });

    it("maps default to inherit", () => {
      expect(mapModelTier("default", "cursor").value).toBe("inherit");
    });

    it("maps powerful to specific model ID", () => {
      expect(mapModelTier("powerful", "cursor").value).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("Gemini CLI", () => {
    it("maps fast to flash preview", () => {
      expect(mapModelTier("fast", "gemini-cli").value).toBe("gemini-3-flash-preview");
    });

    it("maps powerful to pro", () => {
      expect(mapModelTier("powerful", "gemini-cli").value).toBe("gemini-2.5-pro");
    });
  });

  describe("Roo Code", () => {
    it("always returns undefined value", () => {
      expect(mapModelTier("fast", "roo-code").value).toBeUndefined();
      expect(mapModelTier("powerful", "roo-code").value).toBeUndefined();
    });

    it("warns for non-default/inherit tiers", () => {
      const result = mapModelTier("powerful", "roo-code");
      expect(result.warning).toBeDefined();
      expect(result.warning?.feature).toBe("model");
    });

    it("does not warn for default tier", () => {
      expect(mapModelTier("default", "roo-code").warning).toBeUndefined();
    });

    it("does not warn for inherit tier", () => {
      expect(mapModelTier("inherit", "roo-code").warning).toBeUndefined();
    });
  });

  describe("agents that omit model", () => {
    it.each(["github-copilot", "codex", "opencode", "augment", "kilo-code"])(
      "omits model for %s with default tier",
      (agent) => {
        expect(mapModelTier("default", agent).value).toBeUndefined();
      },
    );
  });

  describe("concrete model ID passthrough", () => {
    it("passes through for any agent", () => {
      const agents = ["claude-code", "cursor", "gemini-cli", "codex"];
      for (const agent of agents) {
        expect(mapModelTier("my-custom-model-v2", agent).value).toBe("my-custom-model-v2");
      }
    });
  });
});
