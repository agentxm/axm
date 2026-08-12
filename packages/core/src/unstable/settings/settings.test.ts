import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { expectRecord, handle } from "../test-helpers.js";
import { createDefaultSettings, renderExistingSettings, writeSettings } from "./settings.js";
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
    describe("byte-identity corpus", () => {
      const fixtures = [
        {
          name: "adds a nested map member",
          prior: `{
  "skills": {
    "commit": "^1.0.0"
  }
}\n`,
          next: {
            skills: {
              commit: "^1.0.0",
              review: "^2.0.0",
            },
          },
          expected: `{
  "skills": {
    "commit": "^1.0.0",
    "review": "^2.0.0"
  }
}\n`,
        },
        {
          name: "adds the first member to an empty map",
          prior: `{
  "skills": {}
}\n`,
          next: {
            skills: {
              review: "^2.0.0",
            },
          },
          expected: `{
  "skills": {
    "review": "^2.0.0"
  }
}\n`,
        },
        {
          name: "adds the first canonical top-level key",
          prior: `{
  "agents": [
    "claude-code"
  ]
}\n`,
          next: {
            $schema: "https://axm.sh/schemas/settings.schema.json",
            agents: ["claude-code"],
          },
          expected: `{
  "$schema": "https://axm.sh/schemas/settings.schema.json",
  "agents": [
    "claude-code"
  ]
}\n`,
        },
        {
          name: "adds a middle canonical top-level key",
          prior: `{
  "owner": "@acme",
  "skills": {
    "commit": "^1.0.0"
  }
}\n`,
          next: {
            owner: "@acme",
            agents: ["claude-code"],
            skills: {
              commit: "^1.0.0",
            },
          },
          expected: `{
  "owner": "@acme",
  "agents": [
    "claude-code"
  ],
  "skills": {
    "commit": "^1.0.0"
  }
}\n`,
        },
        {
          name: "adds the last canonical top-level key before unknown keys",
          prior: `{
  "agents": [
    "claude-code"
  ],
  "futureKey": {
    "alpha": 1
  }
}\n`,
          next: {
            agents: ["claude-code"],
            lint: {},
            futureKey: {
              alpha: 1,
            },
          },
          expected: `{
  "agents": [
    "claude-code"
  ],
  "lint": {},
  "futureKey": {
    "alpha": 1
  }
}\n`,
        },
        {
          name: "removes a top-level key",
          prior: `{
  "owner": "@acme",
  "agents": [
    "claude-code"
  ],
  "skills": {
    "commit": "^1.0.0"
  }
}\n`,
          next: {
            owner: "@acme",
            skills: {
              commit: "^1.0.0",
            },
          },
          expected: `{
  "owner": "@acme",
  "skills": {
    "commit": "^1.0.0"
  }
}\n`,
        },
        {
          name: "appends an agent",
          prior: `{
  "agents": [
    "claude-code"
  ]
}\n`,
          next: {
            agents: ["claude-code", "codex"],
          },
          expected: `{
  "agents": [
    "claude-code",
    "codex"
  ]
}\n`,
        },
        {
          name: "appends a source",
          prior: `{
  "sources": [
    {
      "name": "github",
      "type": "github",
      "url": "https://github.com/"
    }
  ]
}\n`,
          next: {
            sources: [
              {
                name: "github",
                type: "github",
                url: "https://github.com",
              },
              {
                name: "gitlab",
                type: "gitlab",
                url: "https://gitlab.com",
              },
            ],
          },
          expected: `{
  "sources": [
    {
      "name": "github",
      "type": "github",
      "url": "https://github.com/"
    },
    {
      "name": "gitlab",
      "type": "gitlab",
      "url": "https://gitlab.com/"
    }
  ]
}\n`,
        },
        {
          name: "removes an agent from the middle of an array",
          prior: `{
  "agents": [
    "claude-code",
    "codex",
    "cursor"
  ]
}\n`,
          next: {
            agents: ["claude-code", "cursor"],
          },
          expected: `{
  "agents": [
    "claude-code",
    "cursor"
  ]
}\n`,
        },
        {
          name: "inserts a multi-line instructions object",
          prior: `{
  "owner": "@acme"
}\n`,
          next: {
            owner: "@acme",
            rulesConfig: {
              instructions: {
                fileName: "TEAM.md",
                gitignoreAliases: false,
              },
            },
          },
          expected: `{
  "owner": "@acme",
  "rulesConfig": {
    "instructions": {
      "fileName": "TEAM.md",
      "gitignoreAliases": false
    }
  }
}\n`,
        },
        {
          name: "drops empty feature config blocks",
          prior: `{
  "rulesConfig": {
    "instructions": false
  },
  "knowledgeConfig": {
    "instructions": false
  }
}\n`,
          next: {
            rulesConfig: {},
            knowledgeConfig: {},
          },
          expected: "{}\n",
        },
      ];

      for (const fixture of fixtures) {
        it.effect(fixture.name, () =>
          withContext(
            Effect.gen(function* () {
              fs.mkdirSync(axmDir, { recursive: true });
              const settingsPath = path.join(axmDir, "settings.json");
              fs.writeFileSync(settingsPath, fixture.prior);
              const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)(fixture.next, {
                onExcessProperty: "error",
              });

              yield* writeSettings(axmDir, settings);

              expect(fs.readFileSync(settingsPath, "utf-8")).toBe(fixture.expected);
            }),
          ),
        );
      }
    });

    it.effect("preserves unrelated blocks when mutating a divergent file", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(
            settingsPath,
            `{
  "agents": [
    "claude-code"
  ],
  "lint": {},
  "skills": {
    "commit": "^1.0.0"
  },
  "packs": {
    "typescript": "@acme/packs/typescript@^1.0.0"
  }
}\n`,
          );
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            agents: ["claude-code"],
            lint: {},
            skills: {
              commit: "^1.0.0",
              review: "^2.0.0",
            },
            packs: {
              typescript: "@acme/packs/typescript@^1.0.0",
            },
          });

          yield* writeSettings(axmDir, settings);

          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(`{
  "agents": [
    "claude-code"
  ],
  "lint": {},
  "skills": {
    "commit": "^1.0.0",
    "review": "^2.0.0"
  },
  "packs": {
    "typescript": "@acme/packs/typescript@^1.0.0"
  }
}\n`);
        }),
      ),
    );

    it.effect("preserves the positions and content of interleaved unknown keys", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(
            settingsPath,
            `{
  "futureFirst": {
    "alpha": 1
  },
  "owner": "@acme",
  "futureMiddle": true,
  "agents": []
}\n`,
          );
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            futureFirst: { alpha: 1 },
            owner: "@acme",
            futureMiddle: true,
            agents: ["claude-code"],
          });

          yield* writeSettings(axmDir, settings);

          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(`{
  "futureFirst": {
    "alpha": 1
  },
  "owner": "@acme",
  "futureMiddle": true,
  "agents": [
    "claude-code"
  ]
}\n`);
        }),
      ),
    );

    it.effect("inserts new top-level keys canonically in canonical files", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(
            settingsPath,
            `{
  "owner": "@acme",
  "skills": {}
}\n`,
          );
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            owner: "@acme",
            agents: ["claude-code"],
            skills: {},
          });

          yield* writeSettings(axmDir, settings);

          expect(
            Object.keys(expectRecord(JSON.parse(fs.readFileSync(settingsPath, "utf-8")))),
          ).toEqual(["owner", "agents", "skills"]);
        }),
      ),
    );

    it.effect("appends new top-level keys in divergent files", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(
            settingsPath,
            `{
  "skills": {},
  "owner": "@acme"
}\n`,
          );
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            skills: {},
            owner: "@acme",
            agents: ["claude-code"],
          });

          yield* writeSettings(axmDir, settings);

          expect(
            Object.keys(expectRecord(JSON.parse(fs.readFileSync(settingsPath, "utf-8")))),
          ).toEqual(["skills", "owner", "agents"]);
        }),
      ),
    );

    it.effect("keeps a divergent file byte-identical on a second write", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(
            settingsPath,
            `{
  "skills": {},
  "owner": "@acme"
}\n`,
          );
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            skills: { review: "^2.0.0" },
            owner: "@acme",
          });

          yield* writeSettings(axmDir, settings);
          const firstContent = fs.readFileSync(settingsPath, "utf-8");
          const decoded = yield* Schema.decodeUnknownEffect(SettingsSchema)(
            JSON.parse(firstContent),
          );
          yield* writeSettings(axmDir, decoded);

          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(firstContent);
          expect(firstContent.indexOf('"skills"')).toBeLessThan(firstContent.indexOf('"owner"'));
        }),
      ),
    );

    it.effect("preserves nonstandard whitespace in untouched regions", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          const lintBlock = `    "lint": {
        "rules": {}
    },`;
          fs.writeFileSync(
            settingsPath,
            `{
${lintBlock}
    "skills": {
        "commit": "^1.0.0"
    }
}\n`,
          );
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            lint: { rules: {} },
            skills: {
              commit: "^1.0.0",
              review: "^2.0.0",
            },
          });

          yield* writeSettings(axmDir, settings);

          const content = fs.readFileSync(settingsPath, "utf-8");
          expect(content).toContain(lintBlock);
          expect(content.indexOf('"lint"')).toBeLessThan(content.indexOf('"skills"'));
        }),
      ),
    );

    it.effect("adds exactly one trailing newline without changing equal content", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          const prior = `{
  "skills": {},
  "owner": "@acme"
}`;
          fs.writeFileSync(settingsPath, prior);
          const settings = yield* Schema.decodeUnknownEffect(SettingsSchema)(JSON.parse(prior));

          yield* writeSettings(axmDir, settings);

          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(`${prior}\n`);
        }),
      ),
    );

    it.effect("falls back to canonical output for malformed prior JSON", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(settingsPath, "{ malformed");
          const settings: Settings = {
            agents: ["claude-code"],
          };

          yield* writeSettings(axmDir, settings);

          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(`{
  "agents": [
    "claude-code"
  ]
}\n`);
        }),
      ),
    );

    it.effect("falls back to canonical output when the prior file cannot be read", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(settingsPath, "{}\n");
          fs.chmodSync(settingsPath, 0o000);
          const settings: Settings = {
            agents: ["claude-code"],
          };

          yield* writeSettings(axmDir, settings);

          expect(fs.readFileSync(settingsPath, "utf-8")).toBe(`{
  "agents": [
    "claude-code"
  ]
}\n`);
        }),
      ),
    );

    it.effect("writes the target value when the prior JSON is not an object", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(settingsPath, "[]\n");
          const settings: Settings = {
            agents: ["claude-code"],
          };

          yield* writeSettings(axmDir, settings);

          expect(JSON.parse(fs.readFileSync(settingsPath, "utf-8"))).toEqual({
            agents: ["claude-code"],
          });
        }),
      ),
    );

    it("falls back to canonical output when an edit produces invalid content", () => {
      const canonicalContent = `{
  "agents": [
    "claude-code"
  ]
}\n`;
      const result = renderExistingSettings(
        "{}\n",
        {},
        { agents: ["claude-code"] },
        canonicalContent,
        () => ({ _tag: "Success", text: "{ invalid" }),
      );

      expect(result).toEqual({
        content: canonicalContent,
        fallbackReason: "edited_content_invalid",
      });
    });

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

    it.effect("writes new files in schema-defined key order", () =>
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

          const result = expectRecord(
            JSON.parse(fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8")),
          );
          expect(result["agents"]).toEqual(["codex"]);
        }),
      ),
    );
  });
});
