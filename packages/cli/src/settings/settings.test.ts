import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { createDefaultSettings, readSettings, writeSettings } from "./settings.js";
import type { Settings } from "./schema.js";

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
});
