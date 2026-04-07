import { describe, expect, it } from "vitest";
import { createWarningCollector, type LossyRenderingWarning } from "./rendering-warnings.js";

describe("rendering-warnings", () => {
  describe("createWarningCollector", () => {
    it("starts empty", () => {
      const collector = createWarningCollector();
      expect(collector.getWarnings()).toEqual([]);
    });

    it("accumulates warnings", () => {
      const collector = createWarningCollector();
      const w1: LossyRenderingWarning = {
        agent: "cursor",
        feature: "model",
        message: "Cursor does not support model specification",
      };
      const w2: LossyRenderingWarning = {
        agent: "cursor",
        feature: "allowedTools",
        message: "Cursor does not support allowed tools",
      };

      collector.add(w1);
      collector.add(w2);

      expect(collector.getWarnings()).toEqual([w1, w2]);
    });

    it("returns a copy from getWarnings", () => {
      const collector = createWarningCollector();
      collector.add({
        agent: "kiro-cli",
        feature: "arguments",
        message: "Kiro does not support variable substitution",
      });

      const first = collector.getWarnings();
      const second = collector.getWarnings();
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });

    it("deduplicates by agent + feature", () => {
      const collector = createWarningCollector();
      collector.add({
        agent: "cursor",
        feature: "model",
        message: "First warning about model",
      });
      collector.add({
        agent: "cursor",
        feature: "model",
        message: "Second warning about model",
      });
      collector.add({
        agent: "cursor",
        feature: "allowedTools",
        message: "Warning about tools",
      });

      const deduped = collector.deduplicate();
      expect(deduped).toHaveLength(2);
      expect(deduped[0]?.feature).toBe("model");
      expect(deduped[0]?.message).toBe("First warning about model");
      expect(deduped[1]?.feature).toBe("allowedTools");
    });

    it("deduplicate keeps different agents separate", () => {
      const collector = createWarningCollector();
      collector.add({
        agent: "cursor",
        feature: "model",
        message: "Cursor model warning",
      });
      collector.add({
        agent: "kiro-cli",
        feature: "model",
        message: "Kiro model warning",
      });

      const deduped = collector.deduplicate();
      expect(deduped).toHaveLength(2);
    });

    it("deduplicate returns empty for empty collector", () => {
      const collector = createWarningCollector();
      expect(collector.deduplicate()).toEqual([]);
    });
  });
});
