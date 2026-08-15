/**
 * Unit tests for subagent entry schema decode/encode behavior.
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

describe("SubagentEntrySchema", () => {
  describe("decode", () => {
    it("decodes a plain string to normalized entry", () => {
      const result = Schema.decodeUnknownSync(SubagentEntrySchema)("@acme/subagents/planner");
      expect(result).toEqual({
        source: "@acme/subagents/planner",
        enabled: true,
      });
    });

    it("decodes an object with source and enabled false", () => {
      const result = Schema.decodeUnknownSync(SubagentEntrySchema)({
        source: "@acme/subagents/planner",
        enabled: false,
      });
      expect(result).toEqual({
        source: "@acme/subagents/planner",
        enabled: false,
      });
    });

    it("decodes an object without enabled as enabled true", () => {
      const result = Schema.decodeUnknownSync(SubagentEntrySchema)({
        source: "@acme/subagents/planner",
      });
      expect(result).toEqual({
        source: "@acme/subagents/planner",
        enabled: true,
      });
    });

    it("rejects a number", () => {
      expect(() => Schema.decodeUnknownSync(SubagentEntrySchema)(42)).toThrow();
    });

    it("rejects object without source", () => {
      expect(() => Schema.decodeUnknownSync(SubagentEntrySchema)({ foo: "bar" })).toThrow();
    });
  });

  describe("encode", () => {
    it("encodes enabled entry to string", () => {
      const result = Schema.encodeSync(SubagentEntrySchema)({
        source: "@acme/subagents/planner",
        enabled: true,
      });
      expect(result).toBe("@acme/subagents/planner");
    });

    it("encodes disabled entry to object", () => {
      const result = Schema.encodeSync(SubagentEntrySchema)({
        source: "@acme/subagents/planner",
        enabled: false,
      });
      expect(result).toEqual({ source: "@acme/subagents/planner", enabled: false });
    });
  });
});

describe("SubagentEntryObjectSchema", () => {
  it("accepts object with source and enabled", () => {
    const result = Schema.decodeUnknownSync(SubagentEntryObjectSchema)({
      source: "@acme/subagents/planner",
      enabled: false,
    });
    expect(result).toEqual({ source: "@acme/subagents/planner", enabled: false });
  });

  it("accepts object with source only", () => {
    const result = Schema.decodeUnknownSync(SubagentEntryObjectSchema)({
      source: "@acme/subagents/planner",
    });
    expect(result).toEqual({ source: "@acme/subagents/planner" });
  });
});

describe("SubagentsMapSchema", () => {
  it("accepts valid subagent name", () => {
    const input = { planner: "@acme/subagents/planner" };
    const result = Schema.decodeUnknownSync(SubagentsMapSchema)(input);

    expect(result).toEqual({
      planner: { source: "@acme/subagents/planner", enabled: true },
    });
  });

  it("accepts subagent name with hyphens", () => {
    const input = { "code-planner": "@acme/subagents/code-planner" };
    const result = Schema.decodeUnknownSync(SubagentsMapSchema)(input);

    expect(result).toEqual({
      "code-planner": {
        source: "@acme/subagents/code-planner",
        enabled: true,
      },
    });
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

    expect(result.subagents).toEqual({
      planner: { source: "@acme/subagents/planner", enabled: true },
    });
  });

  it("accepts settings with subagents alongside other extension types", () => {
    const input = {
      skills: { commit: "@acme/skills/commit" },
      subagents: { planner: "@acme/subagents/planner" },
    };
    const result = Schema.decodeUnknownSync(SettingsSchema)(input);

    expect(result.skills).toEqual({
      commit: { source: "@acme/skills/commit", enabled: true },
    });
    expect(result.subagents).toEqual({
      planner: { source: "@acme/subagents/planner", enabled: true },
    });
  });

  it("accepts settings without subagents", () => {
    const input = { skills: { commit: "@acme/skills/commit" } };
    const result = Schema.decodeUnknownSync(SettingsSchema)(input);

    expect(result.subagents).toBeUndefined();
  });
});
