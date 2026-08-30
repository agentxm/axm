/**
 * Unit tests for parsePluginManifests.
 *
 * Tests plugin manifest parsing for skill discovery.
 * Validates marketplace.json and plugin.json parsing, path validation,
 * and error resilience.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { parsePluginManifests } from "./plugin-manifests.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const withFileSystem = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("parsePluginManifests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "parse-manifests-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("marketplace.json", () => {
    it.effect("returns conventional skills/ dir for each plugin with string source", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ source: "./my-plugin" }, { source: "./other-plugin" }],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
          expect(result).toContainEqual(path.resolve(tempDir, "other-plugin", "skills"));
        }),
      ),
    );

    describe("metadata.pluginRoot", () => {
      it.effect("uses pluginRoot as base for plugin source resolution", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                metadata: { pluginRoot: "./packages" },
                plugins: [{ source: "./my-plugin" }],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toContainEqual(path.resolve(tempDir, "packages", "my-plugin", "skills"));
          }),
        ),
      );

      it.effect("skips entire manifest when pluginRoot does not start with ./", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                metadata: { pluginRoot: "packages" },
                plugins: [{ source: "./my-plugin" }],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toEqual([]);
          }),
        ),
      );

      it.effect("skips entire manifest when pluginRoot is absolute path", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                metadata: { pluginRoot: "/etc/evil" },
                plugins: [{ source: "./my-plugin" }],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toEqual([]);
          }),
        ),
      );
    });

    describe("plugins[].source", () => {
      it.effect("resolves string source relative to basePath", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [{ source: "./my-plugin" }],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
          }),
        ),
      );

      it.effect("resolves omitted source to basePath (root-level plugin)", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [{}],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toContainEqual(path.resolve(tempDir, "skills"));
          }),
        ),
      );

      it.effect("resolves omitted source with pluginRoot", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                metadata: { pluginRoot: "./packages" },
                plugins: [{}],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toContainEqual(path.resolve(tempDir, "packages", "skills"));
          }),
        ),
      );

      it.effect("skips plugins with object source (remote)", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [
                  { source: { url: "https://example.com/plugin.git" } },
                  { source: "./local-plugin" },
                ],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            // Only the local plugin should be processed
            expect(result).toEqual([path.resolve(tempDir, "local-plugin", "skills")]);
          }),
        ),
      );
    });

    describe("conventional {pluginBase}/skills/", () => {
      it.effect("adds skills/ dir even with empty skills array", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [{ source: "./my-plugin", skills: [] }],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
          }),
        ),
      );

      it.effect("adds skills/ dir when skills array is missing", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [{ source: "./my-plugin" }],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
          }),
        ),
      );
    });

    describe("plugins[].skills dirname transformation", () => {
      it.effect("transforms skill paths via dirname", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [
                  {
                    source: "./my-plugin",
                    skills: ["./custom-skills/skill-a", "./other/skill-b"],
                  },
                ],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            // conventional skills/ dir + dirname of each skill path
            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "custom-skills"));
            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "other"));
          }),
        ),
      );

      it.effect("rejects skill paths not starting with ./", () =>
        withFileSystem(
          Effect.gen(function* () {
            const pluginDir = path.join(tempDir, ".claude-plugin");
            fs.mkdirSync(pluginDir, { recursive: true });
            fs.writeFileSync(
              path.join(pluginDir, "marketplace.json"),
              JSON.stringify({
                plugins: [
                  {
                    source: "./my-plugin",
                    skills: ["skills/bad-path", "./valid/skill-a"],
                  },
                ],
              }),
            );

            const result = yield* parsePluginManifests(tempDir);

            // conventional + valid skill path only
            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
            expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "valid"));
            expect(result).not.toContainEqual(path.resolve(tempDir, "my-plugin"));
          }),
        ),
      );
    });
  });

  describe("plugin.json", () => {
    it.effect("returns parent directories from valid skill paths", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["./skills/my-skill", "./tools/other-skill"],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([path.resolve(tempDir, "skills"), path.resolve(tempDir, "tools")]);
        }),
      ),
    );
  });

  describe("missing manifests", () => {
    it.effect("returns empty array when no manifests exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when .claude-plugin directory is missing", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("invalid JSON", () => {
    it.effect("returns empty array for marketplace.json with invalid JSON", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(path.join(pluginDir, "marketplace.json"), "{ invalid json }}}");

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for plugin.json with invalid JSON", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(path.join(pluginDir, "plugin.json"), "not valid json");

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("path traversal rejected", () => {
    it.effect("excludes marketplace plugins with source containing ..", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ source: "./../escape" }, { source: "./valid" }],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          // Only the valid plugin's conventional skills/ dir should be included
          expect(result).toEqual([path.resolve(tempDir, "valid", "skills")]);
        }),
      ),
    );
  });

  describe("paths must start with ./", () => {
    it.effect("excludes paths not starting with ./", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["skills/my-skill", "/absolute/path/skill", "./valid/my-skill"],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          // Only the path starting with ./ should be included
          expect(result).toEqual([path.resolve(tempDir, "valid")]);
        }),
      ),
    );
  });

  describe("resolved path outside basePath", () => {
    it.effect("excludes marketplace plugins with source that escapes basePath", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          // A source that starts with ./ but contains .. to escape
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ source: "./../../../etc" }],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("both manifests present", () => {
    it.effect("combines paths from both marketplace.json and plugin.json", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ source: "./my-plugin" }],
            }),
          );
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["./tools/skill-b"],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          // marketplace: my-plugin/skills, plugin.json: tools
          expect(result).toContainEqual(path.resolve(tempDir, "my-plugin", "skills"));
          expect(result).toContainEqual(path.resolve(tempDir, "tools"));
        }),
      ),
    );
  });

  describe("empty arrays", () => {
    it.effect("returns empty array for empty plugins array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({ plugins: [] }),
          );

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for empty skills array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify({ skills: [] }));

          const result = yield* parsePluginManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("deduplication", () => {
    it.effect("deduplicates paths from both manifests", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          // marketplace produces ./my-plugin/skills, plugin.json also produces ./my-plugin/skills (via dirname)
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ source: "./my-plugin" }],
            }),
          );
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["./my-plugin/skills/skill-c"],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          // Both produce my-plugin/skills -> deduplicated to one entry
          expect(result).toEqual([path.resolve(tempDir, "my-plugin", "skills")]);
        }),
      ),
    );

    it.effect("deduplicates conventional skills/ dirs from multiple plugins with same base", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              // Two plugins with the same source produce the same skills/ dir
              plugins: [{ source: "./my-plugin" }, { source: "./my-plugin" }],
            }),
          );

          const result = yield* parsePluginManifests(tempDir);

          // Both produce my-plugin/skills -> deduplicated
          expect(result).toEqual([path.resolve(tempDir, "my-plugin", "skills")]);
        }),
      ),
    );
  });
});
