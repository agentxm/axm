/**
 * Unit tests for shared plan display utilities.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { PlanStep, Source } from "../../extensions/skills/state/types.js";
import {
  formatHash,
  formatPlanStep,
  formatPlanSummary,
  formatSourceV2,
  getStepSymbol,
} from "./display.js";

describe("display", () => {
  describe("getStepSymbol", () => {
    it("returns + for InstallSkill", () => {
      expect(getStepSymbol("InstallSkill")).toBe("+");
    });

    it("returns ~ for UpdateSkill", () => {
      expect(getStepSymbol("UpdateSkill")).toBe("~");
    });

    it("returns - for UninstallSkill", () => {
      expect(getStepSymbol("UninstallSkill")).toBe("-");
    });
  });

  describe("formatHash", () => {
    it("returns first 7 characters of hash", () => {
      const result = formatHash(Option.some("abc1234567890"));
      expect(result).toBe("abc1234");
    });

    it("strips prefix before colon", () => {
      const result = formatHash(Option.some("sha256:abc1234567890"));
      expect(result).toBe("abc1234");
    });

    it("returns ??????? for None", () => {
      const result = formatHash(Option.none());
      expect(result).toBe("???????");
    });

    it("handles short hashes", () => {
      const result = formatHash(Option.some("abc"));
      expect(result).toBe("abc");
    });
  });

  describe("formatSourceV2", () => {
    it("formats Local source", () => {
      const source: Source = { source: "local", path: "/path/to/skills" };
      expect(formatSourceV2(source)).toBe("/path/to/skills");
    });

    it("formats GitHub source with owner and repo", () => {
      const source: Source = {
        source: "github",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      };
      expect(formatSourceV2(source)).toBe("github:owner/repo");
    });

    it("formats GitHub source with path", () => {
      const source: Source = {
        source: "github",
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.some("skills"),
      };
      expect(formatSourceV2(source)).toBe("github:owner/repo/skills");
    });

    it("formats GitHub source with ref", () => {
      const source: Source = {
        source: "github",
        owner: "owner",
        repo: "repo",
        ref: Option.some("v1.0.0"),
        subPath: Option.none(),
      };
      expect(formatSourceV2(source)).toBe("github:owner/repo@v1.0.0");
    });

    it("formats GitHub source with path and ref", () => {
      const source: Source = {
        source: "github",
        owner: "owner",
        repo: "repo",
        ref: Option.some("main"),
        subPath: Option.some("packages/skills"),
      };
      expect(formatSourceV2(source)).toBe("github:owner/repo/packages/skills@main");
    });

    it("formats Registry source with URL", () => {
      const source: Source = {
        source: "registry",
        url: "https://registry.example.com",
      };
      expect(formatSourceV2(source)).toBe("registry:https://registry.example.com");
    });

    it("formats Registry source with path", () => {
      const source: Source = {
        source: "registry",
        path: "/local/registry",
      };
      expect(formatSourceV2(source)).toBe("registry:/local/registry");
    });
  });

  describe("formatPlanStep", () => {
    it("formats InstallSkill step", () => {
      const step: PlanStep = {
        _tag: "InstallSkill",
        skill: "commit",
        source: { source: "local", path: "/path/to/skills" },
        version: Option.none(),
        gitTreeHash: Option.none(),
        agents: ["claude"],
      };
      const result = formatPlanStep(step);
      expect(result).toMatch(/^\s+\+\s+commit\s+\/path\/to\/skills$/);
    });

    it("formats InstallSkill step with displaySource override", () => {
      const step: PlanStep = {
        _tag: "InstallSkill",
        skill: "commit",
        source: { source: "local", path: "/cache/path" },
        version: Option.none(),
        gitTreeHash: Option.none(),
        agents: ["claude"],
      };
      const result = formatPlanStep(step, "github:owner/repo");
      expect(result).toMatch(/^\s+\+\s+commit\s+github:owner\/repo$/);
    });

    it("formats UpdateSkill step with hashes", () => {
      const step: PlanStep = {
        _tag: "UpdateSkill",
        skill: "review-pr",
        source: { source: "local", path: "/path" },
        fromVersion: Option.none(),
        toVersion: Option.none(),
        fromHash: Option.some("abc1234567890"),
        toHash: Option.some("def5678901234"),
        agents: ["claude"],
      };
      const result = formatPlanStep(step);
      expect(result).toMatch(/^\s+~\s+review-pr\s+abc1234\s+->\s+def5678$/);
    });

    it("formats UpdateSkill step with missing hashes", () => {
      const step: PlanStep = {
        _tag: "UpdateSkill",
        skill: "skill",
        source: { source: "local", path: "/path" },
        fromVersion: Option.none(),
        toVersion: Option.none(),
        fromHash: Option.none(),
        toHash: Option.none(),
        agents: ["claude"],
      };
      const result = formatPlanStep(step);
      expect(result).toContain("??????? -> ???????");
    });

    it("formats UninstallSkill step with agents", () => {
      const step: PlanStep = {
        _tag: "UninstallSkill",
        skill: "old-skill",
        agents: ["claude", "cursor"],
      };
      const result = formatPlanStep(step);
      expect(result).toMatch(/^\s+-\s+old-skill\s+@\s+claude,\s+cursor\s+\(remove\)$/);
    });

    it("formats UninstallSkill step without agents", () => {
      const step: PlanStep = {
        _tag: "UninstallSkill",
        skill: "old-skill",
        agents: [],
      };
      const result = formatPlanStep(step);
      expect(result).toMatch(/^\s+-\s+old-skill\s+\(remove\)$/);
    });
  });

  describe("formatPlanSummary", () => {
    it("formats install only", () => {
      const result = formatPlanSummary({ installed: 2, updated: 0, uninstalled: 0 });
      expect(result).toBe("2 to install");
    });

    it("formats update only", () => {
      const result = formatPlanSummary({ installed: 0, updated: 3, uninstalled: 0 });
      expect(result).toBe("3 to update");
    });

    it("formats uninstall only", () => {
      const result = formatPlanSummary({ installed: 0, updated: 0, uninstalled: 1 });
      expect(result).toBe("1 to uninstall");
    });

    it("formats mixed actions", () => {
      const result = formatPlanSummary({ installed: 1, updated: 2, uninstalled: 1 });
      expect(result).toBe("1 to install, 2 to update, 1 to uninstall");
    });

    it("returns No changes for empty summary", () => {
      const result = formatPlanSummary({ installed: 0, updated: 0, uninstalled: 0 });
      expect(result).toBe("No changes");
    });
  });
});
