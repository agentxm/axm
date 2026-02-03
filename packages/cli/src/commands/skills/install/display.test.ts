/**
 * Unit tests for plan display formatting.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import {
  formatPlan,
  formatPlanStep,
  formatSummaryLine,
  type Plan,
  type PlanStep,
} from "./display.js";

describe("display", () => {
  describe("formatPlanStep", () => {
    it("formats install step with single agent", () => {
      const step: PlanStep = {
        _tag: "InstallSkill",
        skill: "commit",
        agents: ["claude"],
      };

      const result = formatPlanStep(step);

      expect(result).toBe("(install) commit @ claude");
    });

    it("formats install step with multiple agents", () => {
      const step: PlanStep = {
        _tag: "InstallSkill",
        skill: "commit",
        agents: ["claude", "cursor", "codex"],
      };

      const result = formatPlanStep(step);

      expect(result).toBe("(install) commit @ claude, cursor, codex");
    });

    it("formats update step with single agent", () => {
      const step: PlanStep = {
        _tag: "UpdateSkill",
        skill: "my-skill",
        agents: ["claude"],
      };

      const result = formatPlanStep(step);

      expect(result).toBe("(update) my-skill @ claude");
    });

    it("formats update step with multiple agents", () => {
      const step: PlanStep = {
        _tag: "UpdateSkill",
        skill: "my-skill",
        agents: ["claude", "codex", "gemini"],
      };

      const result = formatPlanStep(step);

      expect(result).toBe("(update) my-skill @ claude, codex, gemini");
    });

    it("formats uninstall step with single agent", () => {
      const step: PlanStep = {
        _tag: "UninstallSkill",
        skill: "old-skill",
        agents: ["claude"],
      };

      const result = formatPlanStep(step);

      expect(result).toBe("(uninstall) old-skill @ claude");
    });

    it("formats uninstall step with multiple agents", () => {
      const step: PlanStep = {
        _tag: "UninstallSkill",
        skill: "old-skill",
        agents: ["claude", "cursor"],
      };

      const result = formatPlanStep(step);

      expect(result).toBe("(uninstall) old-skill @ claude, cursor");
    });
  });

  describe("formatSummaryLine", () => {
    it("formats single skill install", () => {
      const result = formatSummaryLine({ install: 1, update: 0, uninstall: 0 });

      expect(result).toBe("1 skill to install");
    });

    it("formats multiple skills install", () => {
      const result = formatSummaryLine({ install: 2, update: 0, uninstall: 0 });

      expect(result).toBe("2 skills to install");
    });

    it("formats single skill update", () => {
      const result = formatSummaryLine({ install: 0, update: 1, uninstall: 0 });

      expect(result).toBe("1 skill to update");
    });

    it("formats multiple skills update", () => {
      const result = formatSummaryLine({ install: 0, update: 3, uninstall: 0 });

      expect(result).toBe("3 skills to update");
    });

    it("formats single skill uninstall", () => {
      const result = formatSummaryLine({ install: 0, update: 0, uninstall: 1 });

      expect(result).toBe("1 skill to uninstall");
    });

    it("formats multiple skills uninstall", () => {
      const result = formatSummaryLine({ install: 0, update: 0, uninstall: 2 });

      expect(result).toBe("2 skills to uninstall");
    });

    it("formats mixed actions", () => {
      const result = formatSummaryLine({ install: 1, update: 2, uninstall: 1 });

      expect(result).toBe("1 skill to install, 2 skills to update, 1 skill to uninstall");
    });

    it("formats install with agent count when more than one unique agent", () => {
      const result = formatSummaryLine({ install: 2, update: 0, uninstall: 0 }, 3);

      expect(result).toBe("2 skills to install across 3 agents");
    });

    it("omits agent count when only one agent", () => {
      const result = formatSummaryLine({ install: 2, update: 0, uninstall: 0 }, 1);

      expect(result).toBe("2 skills to install");
    });

    it("handles empty plan", () => {
      const result = formatSummaryLine({ install: 0, update: 0, uninstall: 0 });

      expect(result).toBe("No changes");
    });
  });

  describe("formatPlan", () => {
    it("formats install plan with multiple skills and agents", () => {
      const plan: Plan = {
        steps: [
          { _tag: "InstallSkill", skill: "commit", agents: ["claude", "cursor", "codex"] },
          { _tag: "InstallSkill", skill: "review-pr", agents: ["claude", "cursor", "codex"] },
        ],
      };

      const result = formatPlan(plan);

      expect(result).toBe(
        `  (install) commit @ claude, cursor, codex
  (install) review-pr @ claude, cursor, codex

  2 skills to install across 3 agents`,
      );
    });

    it("formats install plan with single agent", () => {
      const plan: Plan = {
        steps: [
          { _tag: "InstallSkill", skill: "commit", agents: ["claude"] },
          { _tag: "InstallSkill", skill: "review-pr", agents: ["claude"] },
        ],
      };

      const result = formatPlan(plan);

      expect(result).toBe(
        `  (install) commit @ claude
  (install) review-pr @ claude

  2 skills to install`,
      );
    });

    it("formats update plan", () => {
      const plan: Plan = {
        steps: [{ _tag: "UpdateSkill", skill: "my-skill", agents: ["claude", "codex", "gemini"] }],
      };

      const result = formatPlan(plan);

      expect(result).toBe(
        `  (update) my-skill @ claude, codex, gemini

  1 skill to update across 3 agents`,
      );
    });

    it("formats uninstall plan", () => {
      const plan: Plan = {
        steps: [{ _tag: "UninstallSkill", skill: "old-skill", agents: ["claude"] }],
      };

      const result = formatPlan(plan);

      expect(result).toBe(
        `  (uninstall) old-skill @ claude

  1 skill to uninstall`,
      );
    });

    it("formats mixed plan", () => {
      const plan: Plan = {
        steps: [
          { _tag: "InstallSkill", skill: "new-skill", agents: ["claude", "cursor"] },
          { _tag: "UpdateSkill", skill: "existing-skill", agents: ["claude"] },
          { _tag: "UninstallSkill", skill: "deprecated-skill", agents: ["cursor"] },
        ],
      };

      const result = formatPlan(plan);

      expect(result).toBe(
        `  (install) new-skill @ claude, cursor
  (update) existing-skill @ claude
  (uninstall) deprecated-skill @ cursor

  1 skill to install, 1 skill to update, 1 skill to uninstall across 2 agents`,
      );
    });

    it("handles empty plan", () => {
      const plan: Plan = { steps: [] };

      const result = formatPlan(plan);

      expect(result).toBe("  No changes");
    });
  });
});
