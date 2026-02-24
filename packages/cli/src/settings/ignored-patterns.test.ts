import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CliError } from "../cli-error/index.js";
import { SettingsSchema } from "./schema.js";
import { normalizeIgnoredPatterns, validateIgnoredConfigConflicts } from "./ignored-patterns.js";

describe("SettingsSchema ignored fields", () => {
  it("accepts settings with ignored.skills", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      ignored: { skills: ["openspec-*"] },
    });

    expect(result.ignored?.skills).toEqual(["openspec-*"]);
  });

  it("accepts settings with ignored.commands", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      ignored: { commands: ["legacy-*"] },
    });

    expect(result.ignored?.commands).toEqual(["legacy-*"]);
  });

  it("accepts settings with ignored.mcpServers", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      ignored: { mcpServers: ["test-*"] },
    });

    expect(result.ignored?.mcpServers).toEqual(["test-*"]);
  });

  it("accepts settings with ignored.packs", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      ignored: { packs: ["dev-*"] },
    });

    expect(result.ignored?.packs).toEqual(["dev-*"]);
  });

  it("accepts settings with empty ignored object", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      ignored: {},
    });

    expect(result.ignored).toEqual({});
  });

  it("accepts settings without ignored field", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({});

    expect(result.ignored).toBeUndefined();
  });

  it("accepts settings with all ignored fields", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      ignored: {
        skills: ["a-*"],
        commands: ["b-*"],
        mcpServers: ["c-*"],
        packs: ["d-*"],
      },
    });

    expect(result.ignored?.skills).toEqual(["a-*"]);
    expect(result.ignored?.commands).toEqual(["b-*"]);
    expect(result.ignored?.mcpServers).toEqual(["c-*"]);
    expect(result.ignored?.packs).toEqual(["d-*"]);
  });
});

describe("SettingsSchema mcpServers (camelCase)", () => {
  it("accepts mcpServers key (camelCase)", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      mcpServers: { batcomputer: "^2.0.0" },
    });

    expect(result.mcpServers).toEqual({ batcomputer: "^2.0.0" });
  });
});

describe("normalizeIgnoredPatterns", () => {
  it("trims leading/trailing whitespace", () => {
    const result = Effect.runSync(normalizeIgnoredPatterns(["  openspec-*  ", " foo "]));

    expect(result).toEqual(["openspec-*", "foo"]);
  });

  it("deduplicates patterns after trimming", () => {
    const result = Effect.runSync(normalizeIgnoredPatterns(["openspec-*", " openspec-* "]));

    expect(result).toEqual(["openspec-*"]);
  });

  it("rejects empty patterns after trimming", () => {
    const error = Effect.runSync(normalizeIgnoredPatterns(["  "]).pipe(Effect.flip));

    expect(error).toBeInstanceOf(CliError);
    expect(error.code).toBe("SETTINGS_IGNORED_PATTERN_INVALID");
  });

  it("rejects empty string pattern", () => {
    const error = Effect.runSync(normalizeIgnoredPatterns([""]).pipe(Effect.flip));

    expect(error).toBeInstanceOf(CliError);
    expect(error.code).toBe("SETTINGS_IGNORED_PATTERN_INVALID");
  });

  it("passes through valid patterns unchanged", () => {
    const result = Effect.runSync(normalizeIgnoredPatterns(["openspec-*", "exact-name"]));

    expect(result).toEqual(["openspec-*", "exact-name"]);
  });

  it("handles empty array", () => {
    const result = Effect.runSync(normalizeIgnoredPatterns([]));

    expect(result).toEqual([]);
  });
});

describe("validateIgnoredConfigConflicts", () => {
  it("fails when a configured name matches an ignored pattern", () => {
    const error = Effect.runSync(
      validateIgnoredConfigConflicts(["openspec-core"], ["openspec-*"]).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(CliError);
    expect(error.code).toBe("SETTINGS_IGNORED_CONFIG_CONFLICT");
  });

  it("fails when a configured name matches an exact ignored pattern", () => {
    const error = Effect.runSync(
      validateIgnoredConfigConflicts(["my-skill"], ["my-skill"]).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(CliError);
    expect(error.code).toBe("SETTINGS_IGNORED_CONFIG_CONFLICT");
  });

  it("passes when no configured names match ignored patterns", () => {
    const result = Effect.runSync(validateIgnoredConfigConflicts(["my-skill"], ["openspec-*"]));

    expect(result).toBeUndefined();
  });

  it("passes with empty configured names", () => {
    const result = Effect.runSync(validateIgnoredConfigConflicts([], ["openspec-*"]));

    expect(result).toBeUndefined();
  });

  it("passes with empty ignored patterns", () => {
    const result = Effect.runSync(validateIgnoredConfigConflicts(["my-skill"], []));

    expect(result).toBeUndefined();
  });
});
