import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { expectRecord, handle } from "../test-helpers.js";
import { createDefaultSettings, writeSettings } from "./settings.js";
import { SettingsSchema, type Settings } from "./schema.js";

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
    effect.pipe(Effect.provide(NodeServices.layer));

  describe("createDefaultSettings", () => {
    it("returns empty object", () => {
      const settings = createDefaultSettings();
      expect(settings).toEqual({});
    });
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

    it.effect("writes atomically, leaving no temp file behind", () =>
      withContext(
        Effect.gen(function* () {
          const settings: Settings = {
            skills: { commit: { source: "^1.0.0", enabled: true } },
          };

          yield* writeSettings(axmDir, settings);

          // The atomic write goes through a temp file then rename; no temp is
          // left behind, and the real settings file holds the written content.
          const leftovers = fs.readdirSync(axmDir).filter((name) => name.includes(".tmp"));
          expect(leftovers).toEqual([]);
          const parsed = expectRecord(
            JSON.parse(fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8")),
          );
          expect(parsed).toHaveProperty("skills");
        }),
      ),
    );

    it.effect("preserves unknown top-level keys across a full write cycle", () =>
      withContext(
        Effect.gen(function* () {
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)(
            {
              telemetry: false,
              futureKey: { alpha: 1, beta: ["x"] },
            },
            { onExcessProperty: "error" },
          );

          yield* writeSettings(axmDir, settings);

          const settingsPath = path.join(axmDir, "settings.json");
          const firstContent = fs.readFileSync(settingsPath, "utf-8");
          const parsed = expectRecord(JSON.parse(firstContent));
          expect(parsed["futureKey"]).toEqual({ alpha: 1, beta: ["x"] });
          // Unknown keys land after every canonical key.
          const keys = Object.keys(parsed);
          expect(keys.indexOf("futureKey")).toBe(keys.length - 1);

          // Steady state: a second decode+write cycle is byte-identical.
          const reDecoded = yield* Schema.decodeUnknownEffect(SettingsSchema)(parsed, {
            onExcessProperty: "error",
          });
          yield* writeSettings(axmDir, reDecoded);
          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(firstContent);
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
          const settings: Settings = {
            skills: { commit: { source: "^1.0.0", enabled: true } },
            agents: ["claude-code"],
            owner: handle("@acme"),
          };

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const keys = Object.keys(expectRecord(JSON.parse(content)));
          expect(keys).toEqual(["owner", "agents", "skills"]);
        }),
      ),
    );

    it.effect("round-trips the non-default Knowledge instruction setting", () =>
      withContext(
        Effect.gen(function* () {
          const settings: Settings = {
            agents: ["claude-code"],
            skills: { commit: { source: "^1.0.0", enabled: true } },
            knowledgeConfig: { instructions: false },
          };

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const decoded = Schema.decodeUnknownSync(SettingsSchema)(JSON.parse(content));
          expect(decoded).toEqual(settings);
        }),
      ),
    );

    it.effect("strips empty feature config blocks", () =>
      withContext(
        Effect.gen(function* () {
          const settings: Settings = {
            rulesConfig: {},
            knowledgeConfig: {},
          };

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          expect(JSON.parse(content)).toEqual({});
        }),
      ),
    );

    it.effect("overwrites existing settings file", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const oldSettings: Settings = {
            agents: ["cursor"],
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(oldSettings));

          const newSettings: Settings = {
            agents: ["codex"],
          };
          yield* writeSettings(axmDir, newSettings);

          const result = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          ) as Settings;
          expect(result.agents).toEqual(["codex"]);
        }),
      ),
    );
  });
});
