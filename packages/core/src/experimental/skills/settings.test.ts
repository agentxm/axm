import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach } from "vitest";
import {
  addSkill,
  createDefaultSettings,
  ensureInitialized,
  readSettings,
  updateSettings,
  writeSettings,
} from "./settings.js";
import type { Settings, SkillSettings } from "./types.js";

describe("settings", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  describe("createDefaultSettings", () => {
    it("returns settings with version 1", () => {
      const settings = createDefaultSettings();
      expect(settings.version).toBe(1);
    });

    it("returns settings with empty agents array", () => {
      const settings = createDefaultSettings();
      expect(settings.agents).toEqual([]);
    });

    it("returns settings with empty skills object", () => {
      const settings = createDefaultSettings();
      expect(settings.skills).toEqual({});
    });
  });

  describe("readSettings", () => {
    it.effect("returns SettingsNotFoundError when file does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const error = yield* readSettings(axmDir).pipe(Effect.flip);
          expect(error._tag).toBe("SettingsNotFoundError");
        }),
      ),
    );

    it.effect("reads and parses valid settings file", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settings: Settings = {
            version: 1,
            agents: ["claude-code"],
            skills: {
              commit: {
                source: "github:example/skills",
                agents: ["claude-code"],
              },
            },
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));

          const result = yield* readSettings(axmDir);

          expect(result.version).toBe(1);
          expect(result.agents).toEqual(["claude-code"]);
          expect(result.skills["commit"]?.source).toBe("github:example/skills");
        }),
      ),
    );

    it.effect("returns SettingsParseError for invalid JSON", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json");

          const error = yield* readSettings(axmDir).pipe(Effect.flip);
          expect(error._tag).toBe("SettingsParseError");
        }),
      ),
    );
  });

  describe("writeSettings", () => {
    it.effect("creates directory if it does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const settings = createDefaultSettings();

          yield* writeSettings(axmDir, settings);

          expect(fs.existsSync(axmDir)).toBe(true);
        }),
      ),
    );

    it.effect("writes settings with 2-space indentation", () =>
      withFileSystem(
        Effect.gen(function* () {
          const settings = createDefaultSettings();

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const expected = JSON.stringify(settings, null, 2);
          expect(content).toBe(expected);
        }),
      ),
    );

    it.effect("overwrites existing settings file", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const oldSettings: Settings = {
            version: 1,
            agents: ["old-agent"],
            skills: {},
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(oldSettings));

          const newSettings: Settings = {
            version: 1,
            agents: ["new-agent"],
            skills: {},
          };
          yield* writeSettings(axmDir, newSettings);

          const result = yield* readSettings(axmDir);
          expect(result.agents).toEqual(["new-agent"]);
        }),
      ),
    );
  });

  describe("updateSettings", () => {
    it.effect("merges partial updates with existing settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial: Settings = {
            version: 1,
            agents: ["claude-code"],
            skills: {
              commit: {
                source: "github:example/commit",
                agents: ["claude-code"],
              },
            },
          };
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, { agents: ["cursor"] });

          expect(updated.agents).toEqual(["cursor"]);
          expect(updated.skills["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("merges skills from update with existing skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial: Settings = {
            version: 1,
            agents: [],
            skills: {
              commit: {
                source: "github:example/commit",
                agents: [],
              },
            },
          };
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              "review-pr": {
                source: "github:example/review-pr",
                agents: [],
              },
            },
          });

          expect(updated.skills["commit"]).toBeDefined();
          expect(updated.skills["review-pr"]).toBeDefined();
        }),
      ),
    );

    it.effect("preserves version unless explicitly updated", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial: Settings = {
            version: 1,
            agents: [],
            skills: {},
          };
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, { agents: ["claude-code"] });

          expect(updated.version).toBe(1);
        }),
      ),
    );
  });

  describe("addSkill", () => {
    it.effect("adds a new skill to existing settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial: Settings = {
            version: 1,
            agents: [],
            skills: {},
          };
          yield* writeSettings(axmDir, initial);

          const skillSettings: SkillSettings = {
            source: "github:example/skills",
            agents: ["claude-code"],
          };
          const updated = yield* addSkill(axmDir, "commit", skillSettings);

          expect(updated.skills["commit"]).toEqual(skillSettings);
        }),
      ),
    );

    it.effect("preserves existing skills when adding new one", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial: Settings = {
            version: 1,
            agents: [],
            skills: {
              "existing-skill": {
                source: "github:example/existing",
                agents: [],
              },
            },
          };
          yield* writeSettings(axmDir, initial);

          const skillSettings: SkillSettings = {
            source: "github:example/new",
            agents: [],
          };
          const updated = yield* addSkill(axmDir, "new-skill", skillSettings);

          expect(updated.skills["existing-skill"]).toBeDefined();
          expect(updated.skills["new-skill"]).toEqual(skillSettings);
        }),
      ),
    );

    it.effect("updates existing skill if name matches", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial: Settings = {
            version: 1,
            agents: [],
            skills: {
              commit: {
                source: "github:example/old",
                agents: [],
              },
            },
          };
          yield* writeSettings(axmDir, initial);

          const newSettings: SkillSettings = {
            source: "github:example/new",
            agents: ["claude-code"],
          };
          const updated = yield* addSkill(axmDir, "commit", newSettings);

          expect(updated.skills["commit"]).toEqual(newSettings);
        }),
      ),
    );
  });

  describe("ensureInitialized", () => {
    it.effect("returns existing settings if they exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const existing: Settings = {
            version: 1,
            agents: ["claude-code"],
            skills: {},
          };
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existing));

          const result = yield* ensureInitialized({ axmDir });

          expect(result.agents).toEqual(["claude-code"]);
        }),
      ),
    );

    it.effect("creates default settings if they do not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* ensureInitialized({ axmDir });

          expect(result.version).toBe(1);
          expect(result.agents).toEqual([]);
          expect(result.skills).toEqual({});
        }),
      ),
    );

    it.effect("writes default settings to disk when creating", () =>
      withFileSystem(
        Effect.gen(function* () {
          yield* ensureInitialized({ axmDir });

          const exists = fs.existsSync(path.join(axmDir, "settings.json"));
          expect(exists).toBe(true);
        }),
      ),
    );

    it.effect("returns parse error for invalid existing settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "invalid json");

          const error = yield* ensureInitialized({ axmDir }).pipe(Effect.flip);
          expect(error._tag).toBe("SettingsParseError");
        }),
      ),
    );
  });
});
