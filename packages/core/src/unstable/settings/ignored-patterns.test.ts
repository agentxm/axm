import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { AppError } from "../app-error/index.js";
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
      mcpServers: { batcomputer: "@wayne/mcp-servers/batcomputer" },
    });

    expect(result.mcpServers).toEqual({
      batcomputer: { source: "@wayne/mcp-servers/batcomputer", authored: false },
    });
  });
});

describe("normalizeIgnoredPatterns", () => {
  it.effect("trims leading/trailing whitespace", () =>
    Effect.gen(function* () {
      const result = yield* normalizeIgnoredPatterns(["  openspec-*  ", " foo "]);
      expect(result).toEqual(["openspec-*", "foo"]);
    }),
  );

  it.effect("deduplicates patterns after trimming", () =>
    Effect.gen(function* () {
      const result = yield* normalizeIgnoredPatterns(["openspec-*", " openspec-* "]);
      expect(result).toEqual(["openspec-*"]);
    }),
  );

  it.effect("rejects empty patterns after trimming", () =>
    Effect.gen(function* () {
      const error = yield* normalizeIgnoredPatterns(["  "]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("SETTINGS_IGNORED_PATTERN_INVALID");
    }),
  );

  it.effect("rejects empty string pattern", () =>
    Effect.gen(function* () {
      const error = yield* normalizeIgnoredPatterns([""]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("SETTINGS_IGNORED_PATTERN_INVALID");
    }),
  );

  it.effect("passes through valid patterns unchanged", () =>
    Effect.gen(function* () {
      const result = yield* normalizeIgnoredPatterns(["openspec-*", "exact-name"]);
      expect(result).toEqual(["openspec-*", "exact-name"]);
    }),
  );

  it.effect("handles empty array", () =>
    Effect.gen(function* () {
      const result = yield* normalizeIgnoredPatterns([]);
      expect(result).toEqual([]);
    }),
  );
});

describe("validateIgnoredConfigConflicts", () => {
  it.effect("fails when a configured name matches an ignored pattern", () =>
    Effect.gen(function* () {
      const error = yield* validateIgnoredConfigConflicts(["openspec-core"], ["openspec-*"]).pipe(
        Effect.flip,
      );
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("SETTINGS_IGNORED_CONFIG_CONFLICT");
    }),
  );

  it.effect("fails when a configured name matches an exact ignored pattern", () =>
    Effect.gen(function* () {
      const error = yield* validateIgnoredConfigConflicts(["my-skill"], ["my-skill"]).pipe(
        Effect.flip,
      );
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("SETTINGS_IGNORED_CONFIG_CONFLICT");
    }),
  );

  it.effect("passes when no configured names match ignored patterns", () =>
    Effect.gen(function* () {
      const result = yield* validateIgnoredConfigConflicts(["my-skill"], ["openspec-*"]);
      expect(result).toBeUndefined();
    }),
  );

  it.effect("passes with empty configured names", () =>
    Effect.gen(function* () {
      const result = yield* validateIgnoredConfigConflicts([], ["openspec-*"]);
      expect(result).toBeUndefined();
    }),
  );

  it.effect("passes with empty ignored patterns", () =>
    Effect.gen(function* () {
      const result = yield* validateIgnoredConfigConflicts(["my-skill"], []);
      expect(result).toBeUndefined();
    }),
  );
});
