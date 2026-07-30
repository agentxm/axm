/**
 * Unit tests for path utilities module.
 *
 * Tests the axm directory resolution functions for user and project scopes.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { getAxmDir, getProjectDir, getUserScopeDir } from "./paths.js";

describe("paths", () => {
  describe("getUserScopeDir", () => {
    it.effect("returns path to ~/.axm", () =>
      Effect.gen(function* () {
        const result = yield* getUserScopeDir();
        expect(result).toBe(path.join(os.homedir(), ".axm"));
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns an absolute path", () =>
      Effect.gen(function* () {
        const result = yield* getUserScopeDir();
        expect(path.isAbsolute(result)).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns the same value on repeated calls", () =>
      Effect.gen(function* () {
        const result1 = yield* getUserScopeDir();
        const result2 = yield* getUserScopeDir();
        expect(result1).toBe(result2);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("honors AXM_USER_HOME as a home-directory override", () =>
      Effect.gen(function* () {
        const result = yield* getUserScopeDir();
        expect(result).toBe(path.join("/tmp/axm-user-home", ".axm"));
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            ConfigProvider.layer(
              ConfigProvider.fromEnv({ env: { AXM_USER_HOME: "/tmp/axm-user-home" } }),
            ),
          ),
        ),
      ),
    );

    // Pins the beta.95 Config semantics: an empty AXM_USER_HOME is missing,
    // not a home-directory override of "".
    it.effect("falls back to os.homedir when AXM_USER_HOME is empty", () =>
      Effect.gen(function* () {
        const result = yield* getUserScopeDir();
        expect(result).toBe(path.join(os.homedir(), ".axm"));
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: "" } })),
          ),
        ),
      ),
    );
  });

  describe("getProjectDir", () => {
    it.effect("returns path to ./.axm relative to cwd", () =>
      Effect.gen(function* () {
        const result = yield* getProjectDir();
        expect(result).toBe(path.join(process.cwd(), ".axm"));
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("uses an explicit project root when provided", () =>
      Effect.gen(function* () {
        const result = yield* getProjectDir("/tmp/axm-project");
        expect(result).toBe(path.join("/tmp/axm-project", ".axm"));
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns an absolute path", () =>
      Effect.gen(function* () {
        const result = yield* getProjectDir();
        expect(path.isAbsolute(result)).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns the same value on repeated calls", () =>
      Effect.gen(function* () {
        const result1 = yield* getProjectDir();
        const result2 = yield* getProjectDir();
        expect(result1).toBe(result2);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("getAxmDir", () => {
    it.effect("returns user-scope dir when scope is user", () =>
      Effect.gen(function* () {
        const result = yield* getAxmDir("user");
        const expected = yield* getUserScopeDir();
        expect(result).toBe(expected);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns project dir when scope is project", () =>
      Effect.gen(function* () {
        const result = yield* getAxmDir("project");
        const expected = yield* getProjectDir();
        expect(result).toBe(expected);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("uses explicit project root for project scope", () =>
      Effect.gen(function* () {
        const result = yield* getAxmDir("project", "/tmp/axm-project");
        expect(result).toBe(path.join("/tmp/axm-project", ".axm"));
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns an absolute path regardless of scope", () =>
      Effect.gen(function* () {
        const userResult = yield* getAxmDir("user");
        const projectResult = yield* getAxmDir("project");
        expect(path.isAbsolute(userResult)).toBe(true);
        expect(path.isAbsolute(projectResult)).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns different paths for user and project scopes", () =>
      Effect.gen(function* () {
        const userResult = yield* getAxmDir("user");
        const projectResult = yield* getAxmDir("project");
        expect(typeof userResult).toBe("string");
        expect(typeof projectResult).toBe("string");
        expect(userResult.endsWith(".axm")).toBe(true);
        expect(projectResult.endsWith(".axm")).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });
});
