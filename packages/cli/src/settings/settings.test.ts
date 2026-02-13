import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CliError } from "../cli-error/index.js";
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

  const withContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(NodeContext.layer));

  describe("createDefaultSettings", () => {
    it("returns empty object", () => {
      const settings = createDefaultSettings();
      expect(settings).toEqual({});
    });
  });

  describe("readSettings", () => {
    it.effect("returns Option.none() when file does not exist", () =>
      withContext(
        Effect.gen(function* () {
          const result = yield* readSettings(axmDir);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("reads and parses valid settings file with agents and skills", () =>
      withContext(
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

          expect(Option.isSome(result)).toBe(true);
          const value = Option.getOrThrow(result);
          expect(value.agents).toEqual(["claude-code"]);
          expect(value.skills?.["commit"]).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("reads and parses settings file that omits agents and skills", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settings = { scope: "@myorg" };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));

          const result = yield* readSettings(axmDir);

          expect(Option.isSome(result)).toBe(true);
          const value = Option.getOrThrow(result);
          expect(value.scope).toBe("@myorg");
          expect(value.agents).toBeUndefined();
          expect(value.skills).toBeUndefined();
        }),
      ),
    );

    it.effect("reads and parses empty settings object", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({}));

          const result = yield* readSettings(axmDir);

          expect(Option.isSome(result)).toBe(true);
          expect(Option.getOrThrow(result)).toEqual({});
        }),
      ),
    );

    it.effect("returns CliError with SETTINGS_PARSE_FAILED for invalid JSON", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json");

          const error = yield* readSettings(axmDir).pipe(Effect.flip);
          expect(error).toBeInstanceOf(CliError);
          expect(error.code).toBe("SETTINGS_PARSE_FAILED");
        }),
      ),
    );
  });

  describe("writeSettings", () => {
    it.effect("creates directory if it does not exist", () =>
      withContext(
        Effect.gen(function* () {
          const settings = createDefaultSettings();

          yield* writeSettings(axmDir, settings);

          expect(fs.existsSync(axmDir)).toBe(true);
        }),
      ),
    );

    it.effect("writes settings with 2-space indentation and trailing newline", () =>
      withContext(
        Effect.gen(function* () {
          const settings = createDefaultSettings();

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const expected = JSON.stringify(settings, null, 2) + "\n";
          expect(content).toBe(expected);
        }),
      ),
    );

    it.effect("writes keys in schema-defined order regardless of input order", () =>
      withContext(
        Effect.gen(function* () {
          // Provide settings with keys in reverse order
          const settings = {
            skills: { commit: "^1.0.0" },
            agents: ["claude-code"],
            scope: "@acme",
          } as Settings;

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const keys = Object.keys(JSON.parse(content) as Record<string, unknown>);
          expect(keys).toEqual(["scope", "agents", "skills"]);
        }),
      ),
    );

    it.effect("overwrites existing settings file", () =>
      withContext(
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
          expect(Option.isSome(result)).toBe(true);
          expect(Option.getOrThrow(result).agents).toEqual(["windsurf"]);
        }),
      ),
    );
  });
});
