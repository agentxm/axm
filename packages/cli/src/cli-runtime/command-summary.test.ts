import { describe, expect, it } from "@effect/vitest";
import { summarizeCommandOutcome } from "./command-summary.js";

describe("summarizeCommandOutcome", () => {
  it("maps outcome to cli.outcome", () => {
    const result = summarizeCommandOutcome({ outcome: "applied" });
    expect(result["cli.outcome"]).toBe("applied");
  });

  it("maps all bounded outcome values", () => {
    const outcomes = ["applied", "previewed", "no-op", "cancelled"] as const;
    for (const outcome of outcomes) {
      const result = summarizeCommandOutcome({ outcome });
      expect(result["cli.outcome"]).toBe(outcome);
    }
  });

  it("maps subjectType to cli.subject_type", () => {
    const types = [
      "skill",
      "subagent",
      "pack",
      "mcp-server",
      "rule",
      "hook",
      "knowledge",
      "mixed",
      "unknown",
    ] as const;
    for (const subjectType of types) {
      const result = summarizeCommandOutcome({ subjectType });
      expect(result["cli.subject_type"]).toBe(subjectType);
    }
  });

  it("maps sourceKind to cli.source_kind", () => {
    const kinds = ["registry", "git", "local", "workspace", "mixed", "unknown"] as const;
    for (const sourceKind of kinds) {
      const result = summarizeCommandOutcome({ sourceKind });
      expect(result["cli.source_kind"]).toBe(sourceKind);
    }
  });

  it("includes bounded count properties as numbers", () => {
    const result = summarizeCommandOutcome({
      appliedCount: 3,
      failedCount: 1,
      blockedCount: 0,
    });
    expect(result["cli.applied_count"]).toBe(3);
    expect(typeof result["cli.applied_count"]).toBe("number");
    expect(result["cli.failed_count"]).toBe(1);
    expect(typeof result["cli.failed_count"]).toBe("number");
    expect(result["cli.blocked_count"]).toBe(0);
    expect(typeof result["cli.blocked_count"]).toBe("number");
  });

  it("returns empty record when no fields provided", () => {
    const result = summarizeCommandOutcome({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("omits undefined fields from output", () => {
    const result = summarizeCommandOutcome({ outcome: "applied" });
    expect(result).toHaveProperty("cli.outcome");
    expect(result).not.toHaveProperty("cli.subject_type");
    expect(result).not.toHaveProperty("cli.source_kind");
    expect(result).not.toHaveProperty("cli.applied_count");
    expect(result).not.toHaveProperty("cli.failed_count");
    expect(result).not.toHaveProperty("cli.blocked_count");
  });

  it("returns TelemetryProperties record with all fields when fully specified", () => {
    const result = summarizeCommandOutcome({
      outcome: "previewed",
      subjectType: "pack",
      sourceKind: "git",
      appliedCount: 5,
      failedCount: 2,
      blockedCount: 1,
    });
    expect(result).toEqual({
      "cli.outcome": "previewed",
      "cli.subject_type": "pack",
      "cli.source_kind": "git",
      "cli.applied_count": 5,
      "cli.failed_count": 2,
      "cli.blocked_count": 1,
    });
  });
});
