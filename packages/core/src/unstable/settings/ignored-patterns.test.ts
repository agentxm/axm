import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { AppError } from "../app-error/index.js";
import { SettingsSchema } from "./schema.js";
import { normalizeIgnoredPatterns, validateIgnoredConfigConflicts } from "./ignored-patterns.js";

describe("SettingsSchema feature config ignore fields", () => {
  it("accepts settings with skillsConfig.ignore", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      skillsConfig: { ignore: ["openspec-*"] },
    });

    expect(result.skillsConfig?.ignore).toEqual(["openspec-*"]);
  });

  it("accepts settings with commandsConfig.ignore", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      commandsConfig: { ignore: ["legacy-*"] },
    });

    expect(result.commandsConfig?.ignore).toEqual(["legacy-*"]);
  });

  it("accepts settings with mcpServersConfig.ignore", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      mcpServersConfig: { ignore: ["test-*"] },
    });

    expect(result.mcpServersConfig?.ignore).toEqual(["test-*"]);
  });

  it("accepts settings with packsConfig.ignore", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      packsConfig: { ignore: ["dev-*"] },
    });

    expect(result.packsConfig?.ignore).toEqual(["dev-*"]);
  });

  it("accepts settings with empty config object", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      skillsConfig: {},
    });

    expect(result.skillsConfig).toEqual({});
  });

  it("accepts settings without feature config fields", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({});

    expect(result.skillsConfig).toBeUndefined();
  });

  it("accepts settings with all feature config ignore fields", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      skillsConfig: { ignore: ["a-*"] },
      commandsConfig: { ignore: ["b-*"] },
      subagentsConfig: { ignore: ["c-*"] },
      mcpServersConfig: { ignore: ["d-*"] },
      packsConfig: { ignore: ["e-*"] },
    });

    expect(result.skillsConfig?.ignore).toEqual(["a-*"]);
    expect(result.commandsConfig?.ignore).toEqual(["b-*"]);
    expect(result.subagentsConfig?.ignore).toEqual(["c-*"]);
    expect(result.mcpServersConfig?.ignore).toEqual(["d-*"]);
    expect(result.packsConfig?.ignore).toEqual(["e-*"]);
  });
});

describe("SettingsSchema mcpServers (camelCase)", () => {
  it("accepts mcpServers key (camelCase)", () => {
    const result = Schema.decodeUnknownSync(SettingsSchema)({
      mcpServers: { batcomputer: "@wayne/mcps/batcomputer" },
    });

    expect(result.mcpServers).toEqual({
      batcomputer: {
        source: "@wayne/mcps/batcomputer",
        authored: false,
        enabled: true,
        env: {},
      },
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
      expect(error.code).toBe("validation");
    }),
  );

  it.effect("rejects empty string pattern", () =>
    Effect.gen(function* () {
      const error = yield* normalizeIgnoredPatterns([""]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("validation");
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
      expect(error.code).toBe("conflict");
    }),
  );

  it.effect("fails when a configured name matches an exact ignored pattern", () =>
    Effect.gen(function* () {
      const error = yield* validateIgnoredConfigConflicts(["my-skill"], ["my-skill"]).pipe(
        Effect.flip,
      );
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("conflict");
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
