import { describe, expect, it } from "vitest";
import { substituteVariables, resolveAgentFamily } from "./variable-substitution.js";

describe("variable-substitution", () => {
  describe("resolveAgentFamily", () => {
    it("maps claude-code to claude-code family", () => {
      expect(resolveAgentFamily("claude-code")).toBe("claude-code");
    });

    it("maps codex to claude-code family", () => {
      expect(resolveAgentFamily("codex")).toBe("claude-code");
    });

    it("maps opencode to claude-code family", () => {
      expect(resolveAgentFamily("opencode")).toBe("claude-code");
    });

    it("maps augment to claude-code family", () => {
      expect(resolveAgentFamily("augment")).toBe("claude-code");
    });

    it("maps kilo to claude-code family", () => {
      expect(resolveAgentFamily("kilo")).toBe("claude-code");
    });

    it("maps roo to claude-code family", () => {
      expect(resolveAgentFamily("roo")).toBe("claude-code");
    });

    it("maps cursor to cursor family", () => {
      expect(resolveAgentFamily("cursor")).toBe("cursor");
    });

    it("maps github-copilot to copilot family", () => {
      expect(resolveAgentFamily("github-copilot")).toBe("copilot");
    });

    it("maps gemini-cli to gemini family", () => {
      expect(resolveAgentFamily("gemini-cli")).toBe("gemini");
    });

    it("maps junie to junie family", () => {
      expect(resolveAgentFamily("junie")).toBe("junie");
    });

    it("maps kiro-cli to kiro family", () => {
      expect(resolveAgentFamily("kiro-cli")).toBe("kiro");
    });

    it("falls back to claude-code for unknown agents", () => {
      expect(resolveAgentFamily("unknown-agent")).toBe("claude-code");
    });
  });

  describe("substituteVariables", () => {
    // -----------------------------------------------------------------------
    // No-variable passthrough
    // -----------------------------------------------------------------------

    it("passes through body with no variables", () => {
      const result = substituteVariables("Hello world, no variables here.", "claude-code");
      expect(result.body).toBe("Hello world, no variables here.");
      expect(result.warnings).toEqual([]);
    });

    it("passes through empty body", () => {
      const result = substituteVariables("", "claude-code");
      expect(result.body).toBe("");
      expect(result.warnings).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Escape handling
    // -----------------------------------------------------------------------

    it("unescapes \\{{ to literal {{", () => {
      const result = substituteVariables("Use \\{{this}} for templates", "claude-code");
      expect(result.body).toBe("Use {{this}} for templates");
    });

    it("does not substitute escaped variables", () => {
      const result = substituteVariables("Use \\{{arguments}} literally", "claude-code");
      expect(result.body).toBe("Use {{arguments}} literally");
    });

    // -----------------------------------------------------------------------
    // Claude Code / Codex / OpenCode / Augment / Kilo / Roo family
    // -----------------------------------------------------------------------

    describe("claude-code family", () => {
      const agents = ["claude-code", "codex", "opencode", "augment", "kilo", "roo"];

      for (const agent of agents) {
        it(`${agent}: {{arguments}} -> $ARGUMENTS`, () => {
          const result = substituteVariables("Run with {{arguments}}", agent);
          expect(result.body).toBe("Run with $ARGUMENTS");
          expect(result.warnings).toEqual([]);
        });

        it(`${agent}: {{arguments[0]}} -> $1`, () => {
          const result = substituteVariables("File: {{arguments[0]}}", agent);
          expect(result.body).toBe("File: $1");
        });

        it(`${agent}: {{arguments[2]}} -> $3`, () => {
          const result = substituteVariables("Third: {{arguments[2]}}", agent);
          expect(result.body).toBe("Third: $3");
        });

        it(`${agent}: {{arg:name}} -> appended as context`, () => {
          const result = substituteVariables("Review {{arg:scope}}", agent);
          expect(result.body).toContain("Review ");
          expect(result.body).toContain("**scope:** (provided as context)");
        });
      }
    });

    // -----------------------------------------------------------------------
    // Cursor family
    // -----------------------------------------------------------------------

    describe("cursor family", () => {
      it("{{arguments}} -> $ARGUMENTS", () => {
        const result = substituteVariables("Run with {{arguments}}", "cursor");
        expect(result.body).toBe("Run with $ARGUMENTS");
      });

      it("{{arguments[0]}} -> $ARGUMENTS (inlined)", () => {
        const result = substituteVariables("File: {{arguments[0]}}", "cursor");
        expect(result.body).toBe("File: $ARGUMENTS");
      });

      it("{{arg:name}} -> appended as context", () => {
        const result = substituteVariables("Use {{arg:scope}}", "cursor");
        expect(result.body).toContain("**scope:** (provided as context)");
      });
    });

    // -----------------------------------------------------------------------
    // Copilot family
    // -----------------------------------------------------------------------

    describe("copilot family", () => {
      it("{{arguments}} -> ${input:args}", () => {
        const result = substituteVariables("Run with {{arguments}}", "github-copilot");
        expect(result.body).toBe("Run with ${input:args}");
      });

      it("{{arguments[0]}} -> ${input:arg1}", () => {
        const result = substituteVariables("File: {{arguments[0]}}", "github-copilot");
        expect(result.body).toBe("File: ${input:arg1}");
      });

      it("{{arguments[2]}} -> ${input:arg3}", () => {
        const result = substituteVariables("Third: {{arguments[2]}}", "github-copilot");
        expect(result.body).toBe("Third: ${input:arg3}");
      });

      it("{{arg:name}} -> ${input:name}", () => {
        const result = substituteVariables("Review {{arg:scope}}", "github-copilot");
        expect(result.body).toBe("Review ${input:scope}");
      });
    });

    // -----------------------------------------------------------------------
    // Gemini family
    // -----------------------------------------------------------------------

    describe("gemini family", () => {
      it("{{arguments}} -> {{args}}", () => {
        const result = substituteVariables("Run with {{arguments}}", "gemini-cli");
        expect(result.body).toBe("Run with {{args}}");
      });

      it("{{arguments[0]}} -> {{args}} (inlined)", () => {
        const result = substituteVariables("File: {{arguments[0]}}", "gemini-cli");
        expect(result.body).toBe("File: {{args}}");
      });

      it("{{arg:name}} -> appended as context", () => {
        const result = substituteVariables("Use {{arg:scope}}", "gemini-cli");
        expect(result.body).toContain("**scope:** (provided as context)");
      });
    });

    // -----------------------------------------------------------------------
    // Junie family
    // -----------------------------------------------------------------------

    describe("junie family", () => {
      it("{{arguments}} -> appended", () => {
        const result = substituteVariables("Run with {{arguments}}", "junie");
        expect(result.body).toContain("(all arguments appended)");
      });

      it("{{arguments[0]}} -> $arg1", () => {
        const result = substituteVariables("File: {{arguments[0]}}", "junie");
        expect(result.body).toBe("File: $arg1");
      });

      it("{{arguments[2]}} -> $arg3", () => {
        const result = substituteVariables("Third: {{arguments[2]}}", "junie");
        expect(result.body).toBe("Third: $arg3");
      });

      it("{{arg:name}} -> $name", () => {
        const result = substituteVariables("Review {{arg:scope}}", "junie");
        expect(result.body).toBe("Review $scope");
      });
    });

    // -----------------------------------------------------------------------
    // Kiro family
    // -----------------------------------------------------------------------

    describe("kiro family", () => {
      it("{{arguments}} -> literal text with warning", () => {
        const result = substituteVariables("Run with {{arguments}}", "kiro-cli");
        expect(result.body).toBe("Run with {{arguments}}");
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]?.feature).toBe("variables");
        expect(result.warnings[0]?.agent).toBe("kiro-cli");
      });

      it("{{arguments[0]}} -> literal text with warning", () => {
        const result = substituteVariables("File: {{arguments[0]}}", "kiro-cli");
        expect(result.body).toBe("File: {{arguments[0]}}");
        expect(result.warnings).toHaveLength(1);
      });

      it("{{arg:name}} -> literal text with warning", () => {
        const result = substituteVariables("Review {{arg:scope}}", "kiro-cli");
        expect(result.body).toBe("Review {{arg:scope}}");
        expect(result.warnings).toHaveLength(1);
      });
    });

    // -----------------------------------------------------------------------
    // Multiple variables
    // -----------------------------------------------------------------------

    it("handles multiple variables in one body", () => {
      const body = "Run {{arguments[0]}} with {{arguments[1]}} and {{arg:scope}}";
      const result = substituteVariables(body, "claude-code");
      expect(result.body).toContain("$1");
      expect(result.body).toContain("$2");
      expect(result.body).toContain("**scope:** (provided as context)");
    });

    it("handles mixed variables and escaped sequences", () => {
      const body = "Use {{arguments}} but \\{{not_this}}";
      const result = substituteVariables(body, "claude-code");
      expect(result.body).toBe("Use $ARGUMENTS but {{not_this}}");
    });
  });
});
