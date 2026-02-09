/**
 * Unit tests for SettingsService.
 *
 * Tests query methods (getScope, getAgents, getSkills), mutation methods
 * (addSkill, removeSkill, addAgent), auto-creation of settings.json,
 * semaphore serialization, and path resolution from Workspace.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Workspace, type WorkspaceContextService } from "../workspace/service.js";
import type { Settings } from "./schema.js";
import { DEFAULT_SCOPE, SettingsParseError, SETTINGS_FILENAME } from "./settings.js";
import { SettingsService, SettingsServiceLive } from "./service.js";

describe("SettingsService", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-service-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Write a settings.json file to the test .axm directory. */
  const initSettings = (settings: Settings): void => {
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(path.join(axmDir, SETTINGS_FILENAME), JSON.stringify(settings, null, 2));
  };

  /** Read settings.json from disk for verification. */
  const readSettingsFromDisk = (): Settings =>
    JSON.parse(fs.readFileSync(path.join(axmDir, SETTINGS_FILENAME), "utf-8")) as Settings;

  /** Create a test layer with a mock Workspace pointing at the temp .axm dir. */
  const makeTestLayer = (dir: string) => {
    const mockWs: WorkspaceContextService = {
      global: false,
      path: dir,
      nonInteractive: true,
      preview: false,
      resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    };
    return Layer.provide(
      SettingsServiceLive,
      Layer.merge(NodeContext.layer, Workspace.layer(mockWs)),
    );
  };

  describe("getScope", () => {
    it.effect("returns configured scope when scope field is set", () =>
      Effect.gen(function* () {
        initSettings({ scope: "acme" });

        const service = yield* SettingsService;
        const scope = yield* service.getScope();

        expect(scope).toBe("acme");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("returns DEFAULT_SCOPE when no scope field", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;
        const scope = yield* service.getScope();

        expect(scope).toBe(DEFAULT_SCOPE);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("getAgents", () => {
    it.effect("returns agents array when agents are configured", () =>
      Effect.gen(function* () {
        initSettings({ agents: ["claude-code", "cursor"] } as Settings);

        const service = yield* SettingsService;
        const agents = yield* service.getAgents();

        expect(agents).toEqual(["claude-code", "cursor"]);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("returns empty array when no agents field", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;
        const agents = yield* service.getAgents();

        expect(agents).toEqual([]);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("getSkills", () => {
    it.effect("returns skills map when skills are configured", () =>
      Effect.gen(function* () {
        initSettings({
          skills: {
            "code-review": "@community/code-review@^1.0.0",
            "test-gen": "github:acme/test-gen",
          },
        } as Settings);

        const service = yield* SettingsService;
        const skills = yield* service.getSkills();

        expect(skills).toEqual({
          "code-review": "@community/code-review@^1.0.0",
          "test-gen": "github:acme/test-gen",
        });
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("returns empty record when no skills field", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;
        const skills = yield* service.getSkills();

        expect(skills).toEqual({});
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("addSkill", () => {
    it.effect("adds a new skill entry and persists to disk", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;
        yield* service.addSkill("code-review", "@community/code-review@^1.0.0");

        const settings = readSettingsFromDisk();
        expect(settings.skills).toEqual({ "code-review": "@community/code-review@^1.0.0" });
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("updates an existing skill entry", () =>
      Effect.gen(function* () {
        initSettings({
          skills: { "code-review": "@community/code-review@^1.0.0" },
        } as Settings);

        const service = yield* SettingsService;
        yield* service.addSkill("code-review", "@community/code-review@^2.0.0");

        const settings = readSettingsFromDisk();
        expect(settings.skills).toEqual({ "code-review": "@community/code-review@^2.0.0" });
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("preserves existing file formatting", () =>
      Effect.gen(function* () {
        // Write tab-indented settings
        fs.mkdirSync(axmDir, { recursive: true });
        const tabIndented =
          '{\n\t"skills": {\n\t\t"existing": "@community/existing@^1.0.0"\n\t}\n}\n';
        fs.writeFileSync(path.join(axmDir, SETTINGS_FILENAME), tabIndented);

        const service = yield* SettingsService;
        yield* service.addSkill("code-review", "@community/code-review@^1.0.0");

        const content = fs.readFileSync(path.join(axmDir, SETTINGS_FILENAME), "utf-8");
        // New skill should use tab indentation matching the file
        expect(content).toContain('\t\t"code-review"');
        // Existing content outside edit region should be preserved
        expect(content).toContain('\t\t"existing": "@community/existing@^1.0.0"');
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("preserves compact array formatting of siblings when skills key is missing", () =>
      Effect.gen(function* () {
        // Reproduce the exact user scenario: agents as compact single-line array, no skills key
        fs.mkdirSync(axmDir, { recursive: true });
        const original = '{\n  "agents": ["antigravity", "claude-code", "codex", "cursor"]\n}\n';
        fs.writeFileSync(path.join(axmDir, SETTINGS_FILENAME), original);

        const service = yield* SettingsService;
        yield* service.addSkill("frontend-design", "github:anthropics/skills");

        const content = fs.readFileSync(path.join(axmDir, SETTINGS_FILENAME), "utf-8");
        // agents must remain on a single line — not expanded to multi-line
        expect(content).toContain('"agents": ["antigravity", "claude-code", "codex", "cursor"]');
        // skill should be added
        expect(content).toContain('"frontend-design": "github:anthropics/skills"');
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("concurrent addSkill calls do not lose data", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;

        // Run two addSkill calls concurrently — semaphore serializes them
        yield* Effect.all(
          [
            service.addSkill("skill-a", "@community/skill-a@^1.0.0"),
            service.addSkill("skill-b", "@community/skill-b@^1.0.0"),
          ],
          { concurrency: "unbounded" },
        );

        const settings = readSettingsFromDisk();
        expect(settings.skills).toHaveProperty("skill-a", "@community/skill-a@^1.0.0");
        expect(settings.skills).toHaveProperty("skill-b", "@community/skill-b@^1.0.0");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("removeSkill", () => {
    it.effect("removes an existing skill and persists to disk", () =>
      Effect.gen(function* () {
        initSettings({
          skills: {
            "code-review": "@community/code-review@^1.0.0",
            "test-gen": "github:acme/test-gen",
          },
        } as Settings);

        const service = yield* SettingsService;
        yield* service.removeSkill("code-review");

        const settings = readSettingsFromDisk();
        expect(settings.skills).toEqual({ "test-gen": "github:acme/test-gen" });
        expect(settings.skills).not.toHaveProperty("code-review");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("preserves existing file formatting", () =>
      Effect.gen(function* () {
        fs.mkdirSync(axmDir, { recursive: true });
        const tabIndented =
          '{\n\t"scope": "acme",\n\t"skills": {\n\t\t"code-review": "@community/code-review@^1.0.0",\n\t\t"test-gen": "github:acme/test-gen"\n\t}\n}\n';
        fs.writeFileSync(path.join(axmDir, SETTINGS_FILENAME), tabIndented);

        const service = yield* SettingsService;
        yield* service.removeSkill("code-review");

        const content = fs.readFileSync(path.join(axmDir, SETTINGS_FILENAME), "utf-8");
        // Scope should be preserved with tab indentation
        expect(content).toContain('\t"scope": "acme"');
        // Removed skill should be gone
        expect(content).not.toContain("code-review");
        // Remaining skill preserved
        expect(content).toContain('\t\t"test-gen": "github:acme/test-gen"');
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("no-op when skill does not exist", () =>
      Effect.gen(function* () {
        initSettings({ skills: { "test-gen": "github:acme/test-gen" } } as Settings);

        const service = yield* SettingsService;
        yield* service.removeSkill("nonexistent");

        // File should be unchanged — no error, no write
        const settings = readSettingsFromDisk();
        expect(settings.skills).toEqual({ "test-gen": "github:acme/test-gen" });
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("addAgent", () => {
    it.effect("appends new agent ID and persists to disk", () =>
      Effect.gen(function* () {
        initSettings({ agents: ["claude-code"] } as Settings);

        const service = yield* SettingsService;
        yield* service.addAgent("cursor");

        const settings = readSettingsFromDisk();
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("preserves existing file formatting", () =>
      Effect.gen(function* () {
        fs.mkdirSync(axmDir, { recursive: true });
        const tabIndented = '{\n\t"scope": "acme",\n\t"agents": [\n\t\t"claude-code"\n\t]\n}\n';
        fs.writeFileSync(path.join(axmDir, SETTINGS_FILENAME), tabIndented);

        const service = yield* SettingsService;
        yield* service.addAgent("cursor");

        const content = fs.readFileSync(path.join(axmDir, SETTINGS_FILENAME), "utf-8");
        // Scope should be preserved with tab indentation
        expect(content).toContain('\t"scope": "acme"');
        // Both agents present
        expect(content).toContain("claude-code");
        expect(content).toContain("cursor");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("no-op when agent already present", () =>
      Effect.gen(function* () {
        initSettings({ agents: ["claude-code", "cursor"] } as Settings);

        const service = yield* SettingsService;
        yield* service.addAgent("cursor");

        // Should be unchanged — no duplicate
        const settings = readSettingsFromDisk();
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("fails with SettingsParseError for invalid agent ID", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;
        const error = yield* service.addAgent("not-a-real-agent").pipe(Effect.flip);

        expect(error).toBeInstanceOf(SettingsParseError);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("does not write to disk on invalid agent ID", () =>
      Effect.gen(function* () {
        initSettings({});

        const service = yield* SettingsService;
        yield* service.addAgent("not-a-real-agent").pipe(Effect.ignore);

        const settings = readSettingsFromDisk();
        expect(settings.agents).toBeUndefined();
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("auto-creation", () => {
    it.effect("creates settings.json with {} when file does not exist on first query", () =>
      Effect.gen(function* () {
        // Do NOT call initSettings — no settings.json exists
        // But ensure the .axm directory exists for the Workspace path
        fs.mkdirSync(axmDir, { recursive: true });

        const service = yield* SettingsService;
        const scope = yield* service.getScope();

        expect(scope).toBe(DEFAULT_SCOPE);
        expect(fs.existsSync(path.join(axmDir, SETTINGS_FILENAME))).toBe(true);

        const content = readSettingsFromDisk();
        expect(content).toEqual({});
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("creates settings.json with {} when file does not exist on first mutation", () =>
      Effect.gen(function* () {
        // Do NOT call initSettings — no settings.json exists
        fs.mkdirSync(axmDir, { recursive: true });

        const service = yield* SettingsService;
        yield* service.addSkill("code-review", "@community/code-review@^1.0.0");

        expect(fs.existsSync(path.join(axmDir, SETTINGS_FILENAME))).toBe(true);

        const settings = readSettingsFromDisk();
        expect(settings.skills).toEqual({ "code-review": "@community/code-review@^1.0.0" });
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("path resolution", () => {
    it.effect("uses Workspace.path to determine settings file location", () =>
      Effect.gen(function* () {
        // Create settings in a custom location
        const customAxmDir = path.join(tempDir, "custom-workspace");
        fs.mkdirSync(customAxmDir, { recursive: true });
        fs.writeFileSync(
          path.join(customAxmDir, SETTINGS_FILENAME),
          JSON.stringify({ scope: "custom-scope" }),
        );

        const service = yield* SettingsService;
        const scope = yield* service.getScope();

        // Should read from the custom path, not the default axmDir
        expect(scope).toBe("custom-scope");
      }).pipe(Effect.provide(makeTestLayer(path.join(tempDir, "custom-workspace")))),
    );
  });
});
