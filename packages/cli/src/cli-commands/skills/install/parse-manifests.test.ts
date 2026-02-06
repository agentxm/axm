/**
 * Unit tests for parseManifests.
 *
 * Tests plugin manifest parsing for skill discovery.
 * Validates marketplace.json and plugin.json parsing, path validation,
 * and error resilience.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { parseManifests } from "./parse-manifests.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer));

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("parseManifests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "parse-manifests-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("marketplace.json", () => {
    it.effect("returns parent directories from valid skill paths", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ skillPath: "./skills/my-skill" }, { skillPath: "./tools/other-skill" }],
            }),
          );

          const result = yield* parseManifests(tempDir);

          expect(result).toEqual([path.resolve(tempDir, "skills"), path.resolve(tempDir, "tools")]);
        }),
      ),
    );
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

          const result = yield* parseManifests(tempDir);

          expect(result).toEqual([path.resolve(tempDir, "skills"), path.resolve(tempDir, "tools")]);
        }),
      ),
    );
  });

  describe("missing manifests", () => {
    it.effect("returns empty array when no manifests exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* parseManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when .claude-plugin directory is missing", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* parseManifests(tempDir);

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

          const result = yield* parseManifests(tempDir);

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

          const result = yield* parseManifests(tempDir);

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("path traversal rejected", () => {
    it.effect("excludes paths containing ..", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ skillPath: "./../escape/my-skill" }, { skillPath: "./valid/my-skill" }],
            }),
          );

          const result = yield* parseManifests(tempDir);

          // Only the valid path should be included
          expect(result).toEqual([path.resolve(tempDir, "valid")]);
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

          const result = yield* parseManifests(tempDir);

          // Only the path starting with ./ should be included
          expect(result).toEqual([path.resolve(tempDir, "valid")]);
        }),
      ),
    );
  });

  describe("resolved path outside basePath", () => {
    it.effect("excludes paths that resolve outside basePath", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          // A path that starts with ./ but contains .. to escape
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ skillPath: "./../../../etc/skill" }],
            }),
          );

          const result = yield* parseManifests(tempDir);

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
              plugins: [{ skillPath: "./skills/skill-a" }],
            }),
          );
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["./tools/skill-b"],
            }),
          );

          const result = yield* parseManifests(tempDir);

          expect(result).toEqual([path.resolve(tempDir, "skills"), path.resolve(tempDir, "tools")]);
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

          const result = yield* parseManifests(tempDir);

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

          const result = yield* parseManifests(tempDir);

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
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ skillPath: "./skills/skill-a" }, { skillPath: "./skills/skill-b" }],
            }),
          );
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["./skills/skill-c"],
            }),
          );

          const result = yield* parseManifests(tempDir);

          // ./skills/skill-a and ./skills/skill-b and ./skills/skill-c
          // all have parent dir "skills", so should be deduplicated to one entry
          expect(result).toEqual([path.resolve(tempDir, "skills")]);
        }),
      ),
    );

    it.effect("deduplicates paths within a single manifest", () =>
      withFileSystem(
        Effect.gen(function* () {
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ skillPath: "./skills/skill-a" }, { skillPath: "./skills/skill-b" }],
            }),
          );

          const result = yield* parseManifests(tempDir);

          // Both have parent dir "skills" -> deduplicated
          expect(result).toEqual([path.resolve(tempDir, "skills")]);
        }),
      ),
    );
  });
});
