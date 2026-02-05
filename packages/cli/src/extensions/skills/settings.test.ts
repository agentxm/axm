import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  addSkill,
  createDefaultSettings,
  ensureInitialized,
  readSettings,
  updateSettings,
  writeSettings,
} from "./settings.js";
import type { Settings } from "./types.js";

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
    it("returns empty object", () => {
      const settings = createDefaultSettings();
      expect(settings).toEqual({});
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

    it.effect("reads and parses valid settings file with agents and skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settings: Settings = {
            agents: ["claude-code"],
            skills: {
              commit: "^1.0.0",
            },
          } as Settings;
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));

          const result = yield* readSettings(axmDir);

          expect(result.agents).toEqual(["claude-code"]);
          expect(result.skills?.["commit"]).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("reads and parses settings file that omits agents and skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settings = { scope: "@myorg" };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));

          const result = yield* readSettings(axmDir);

          expect(result.scope).toBe("@myorg");
          expect(result.agents).toBeUndefined();
          expect(result.skills).toBeUndefined();
        }),
      ),
    );

    it.effect("reads and parses empty settings object", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({}));

          const result = yield* readSettings(axmDir);

          expect(result).toEqual({});
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
          const oldSettings = {
            agents: ["cursor"],
          } as Settings;
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(oldSettings));

          const newSettings = {
            agents: ["windsurf"],
          } as Settings;
          yield* writeSettings(axmDir, newSettings);

          const result = yield* readSettings(axmDir);
          expect(result.agents).toEqual(["windsurf"]);
        }),
      ),
    );
  });

  describe("updateSettings", () => {
    it.effect("merges partial updates with existing settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            agents: ["claude-code"],
            skills: {
              commit: "^1.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, { agents: ["cursor"] });

          expect(updated.agents).toEqual(["cursor"]);
          expect(updated.skills?.["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("merges skills from update with existing skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            agents: [],
            skills: {
              commit: "^1.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              "review-pr": "^2.0.0",
            },
          });

          expect(updated.skills?.["commit"]).toBeDefined();
          expect(updated.skills?.["review-pr"]).toBeDefined();
        }),
      ),
    );

    it.effect("handles update when current settings has undefined skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = { agents: ["claude-code"] } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              commit: "^1.0.0",
            },
          });

          expect(updated.skills?.["commit"]).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("removes a skill when set to null", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            agents: [],
            skills: {
              commit: "^1.0.0",
              "review-pr": "^2.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              commit: null,
            },
          });

          expect(updated.skills?.["commit"]).toBeUndefined();
          expect(updated.skills?.["review-pr"]).toBe("^2.0.0");
        }),
      ),
    );

    it.effect("preserves other skills when removing one with null", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            skills: {
              "skill-a": "^1.0.0",
              "skill-b": "^2.0.0",
              "skill-c": "^3.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              "skill-b": null,
            },
          });

          expect(updated.skills?.["skill-a"]).toBe("^1.0.0");
          expect(updated.skills?.["skill-b"]).toBeUndefined();
          expect(updated.skills?.["skill-c"]).toBe("^3.0.0");
          expect(Object.keys(updated.skills ?? {})).toHaveLength(2);
        }),
      ),
    );

    it.effect("removing a non-existent skill is a no-op", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            skills: {
              commit: "^1.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              "non-existent": null,
            },
          });

          expect(updated.skills?.["commit"]).toBe("^1.0.0");
          expect(updated.skills?.["non-existent"]).toBeUndefined();
          expect(Object.keys(updated.skills ?? {})).toHaveLength(1);
        }),
      ),
    );

    it.effect("can add and remove skills in the same update", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            skills: {
              "old-skill": "^1.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              "old-skill": null,
              "new-skill": "^2.0.0",
            },
          });

          expect(updated.skills?.["old-skill"]).toBeUndefined();
          expect(updated.skills?.["new-skill"]).toBe("^2.0.0");
        }),
      ),
    );

    it.effect("removing last skill results in empty skills object", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            skills: {
              "only-skill": "^1.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* updateSettings(axmDir, {
            skills: {
              "only-skill": null,
            },
          });

          expect(updated.skills).toEqual({});
        }),
      ),
    );
  });

  describe("addSkill", () => {
    it.effect("adds a new skill to existing settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            agents: [],
            skills: {},
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* addSkill(axmDir, "commit", "^1.0.0");

          expect(updated.skills?.["commit"]).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("preserves existing skills when adding new one", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            agents: [],
            skills: {
              "existing-skill": "*",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* addSkill(axmDir, "new-skill", "^1.0.0");

          expect(updated.skills?.["existing-skill"]).toBeDefined();
          expect(updated.skills?.["new-skill"]).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("updates existing skill if name matches", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {
            agents: [],
            skills: {
              commit: "^1.0.0",
            },
          } as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* addSkill(axmDir, "commit", "^2.0.0");

          expect(updated.skills?.["commit"]).toBe("^2.0.0");
        }),
      ),
    );

    it.effect("adds skill when current settings has undefined skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initial = {} as Settings;
          yield* writeSettings(axmDir, initial);

          const updated = yield* addSkill(axmDir, "commit", "^1.0.0");

          expect(updated.skills?.["commit"]).toBe("^1.0.0");
        }),
      ),
    );
  });

  describe("ensureInitialized", () => {
    it.effect("returns existing settings if they exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const existing = {
            agents: ["claude-code"],
          } as Settings;
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

          expect(result).toEqual({});
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
