/**
 * Unit tests for subagent entry normalization and collapse.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import {
  SubagentEntryObjectSchema,
  SubagentEntrySchema,
  SubagentsMapSchema,
  SettingsSchema,
} from "./schema.js";
import {
  collapseSubagentEntry,
  getSubagentEntrySource,
  normalizeSubagentEntry,
} from "./subagent-entry.js";

describe("SubagentEntrySchema", () => {
  it("accepts a plain string", () => {
    const result = Schema.decodeUnknownSync(SubagentEntrySchema)("@acme/subagents/planner");

    expect(result).toBe("@acme/subagents/planner");
  });

  it("accepts an object with source", () => {
    const result = Schema.decodeUnknownSync(SubagentEntryObjectSchema)({
      source: "@acme/subagents/planner",
    });

    expect(result).toEqual({ source: "@acme/subagents/planner" });
  });

  it("accepts an object with source and enabled", () => {
    const result = Schema.decodeUnknownSync(SubagentEntrySchema)({
      source: "@acme/subagents/planner",
      enabled: false,
    });

    expect(result).toEqual({ source: "@acme/subagents/planner", enabled: false });
  });

  it("rejects a number", () => {
    expect(() => Schema.decodeUnknownSync(SubagentEntrySchema)(42)).toThrow();
  });

  it("rejects object without source", () => {
    expect(() => Schema.decodeUnknownSync(SubagentEntrySchema)({ foo: "bar" })).toThrow();
  });
});

describe("SubagentsMapSchema", () => {
  it("accepts valid subagent name", () => {
    const input = { planner: "@acme/subagents/planner" };
    const result = Schema.decodeUnknownSync(SubagentsMapSchema)(input);

    expect(result).toEqual({ planner: "@acme/subagents/planner" });
  });

  it("accepts subagent name with hyphens", () => {
    const input = { "code-planner": "@acme/subagents/code-planner" };
    const result = Schema.decodeUnknownSync(SubagentsMapSchema)(input);

    expect(result).toEqual({ "code-planner": "@acme/subagents/code-planner" });
  });

  it("accepts empty map", () => {
    const result = Schema.decodeUnknownSync(SubagentsMapSchema)({});

    expect(result).toEqual({});
  });

  it("rejects subagent name starting with hyphen", () => {
    const input = { "-invalid": "@acme/subagents/planner" };

    expect(() => Schema.decodeUnknownSync(SubagentsMapSchema)(input)).toThrow();
  });

  it("rejects subagent name with uppercase letters", () => {
    const input = { MySubagent: "@acme/subagents/planner" };

    expect(() => Schema.decodeUnknownSync(SubagentsMapSchema)(input)).toThrow();
  });

  it("rejects subagent name over 64 characters", () => {
    const name = "a".repeat(65);
    const input = { [name]: "@acme/subagents/planner" };

    expect(() => Schema.decodeUnknownSync(SubagentsMapSchema)(input)).toThrow();
  });
});

describe("SettingsSchema with subagents", () => {
  it("accepts settings with subagents at root", () => {
    const input = {
      subagents: { planner: "@acme/subagents/planner" },
    };
    const result = Schema.decodeUnknownSync(SettingsSchema)(input);

    expect(result.subagents).toEqual({ planner: "@acme/subagents/planner" });
  });

  it("accepts settings with subagents alongside other extension types", () => {
    const input = {
      skills: { commit: "@acme/skills/commit" },
      commands: { deploy: "@acme/commands/deploy" },
      subagents: { planner: "@acme/subagents/planner" },
    };
    const result = Schema.decodeUnknownSync(SettingsSchema)(input);

    expect(result.skills).toEqual({ commit: "@acme/skills/commit" });
    expect(result.commands).toEqual({ deploy: "@acme/commands/deploy" });
    expect(result.subagents).toEqual({ planner: "@acme/subagents/planner" });
  });

  it("accepts settings without subagents", () => {
    const input = { skills: { commit: "@acme/skills/commit" } };
    const result = Schema.decodeUnknownSync(SettingsSchema)(input);

    expect(result.subagents).toBeUndefined();
  });
});

describe("normalizeSubagentEntry", () => {
  it("normalizes string entry to enabled object", () => {
    const result = normalizeSubagentEntry("@acme/subagents/planner");

    expect(result).toEqual({ source: "@acme/subagents/planner", enabled: true });
  });

  it("normalizes object entry with explicit enabled", () => {
    const result = normalizeSubagentEntry({ source: "@acme/subagents/planner", enabled: false });

    expect(result).toEqual({ source: "@acme/subagents/planner", enabled: false });
  });

  it("defaults enabled to true when omitted", () => {
    const result = normalizeSubagentEntry({ source: "@acme/subagents/planner" });

    expect(result).toEqual({ source: "@acme/subagents/planner", enabled: true });
  });
});

describe("getSubagentEntrySource", () => {
  it("extracts source from string entry", () => {
    expect(getSubagentEntrySource("@acme/subagents/planner")).toBe("@acme/subagents/planner");
  });

  it("extracts source from object entry", () => {
    expect(getSubagentEntrySource({ source: "@acme/subagents/planner" })).toBe(
      "@acme/subagents/planner",
    );
  });
});

describe("collapseSubagentEntry", () => {
  it("collapses enabled entry to string", () => {
    const result = collapseSubagentEntry({ source: "@acme/subagents/planner", enabled: true });

    expect(result).toBe("@acme/subagents/planner");
  });

  it("preserves disabled entry as object", () => {
    const result = collapseSubagentEntry({ source: "@acme/subagents/planner", enabled: false });

    expect(result).toEqual({ source: "@acme/subagents/planner", enabled: false });
  });
});
