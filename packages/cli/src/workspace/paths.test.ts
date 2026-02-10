/**
 * Unit tests for path utilities module.
 *
 * Tests the axm directory resolution functions for global and project scopes.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { getAxmDir, getGlobalDir, getProjectDir } from "./paths.js";

describe("paths", () => {
  describe("getGlobalDir", () => {
    it.effect("returns path to ~/.axm", () =>
      Effect.gen(function* () {
        const result = yield* getGlobalDir();
        expect(result).toBe(path.join(os.homedir(), ".axm"));
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns an absolute path", () =>
      Effect.gen(function* () {
        const result = yield* getGlobalDir();
        expect(path.isAbsolute(result)).toBe(true);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns the same value on repeated calls", () =>
      Effect.gen(function* () {
        const result1 = yield* getGlobalDir();
        const result2 = yield* getGlobalDir();
        expect(result1).toBe(result2);
      }).pipe(Effect.provide(NodeContext.layer)),
    );
  });

  describe("getProjectDir", () => {
    it.effect("returns path to ./.axm relative to cwd", () =>
      Effect.gen(function* () {
        const result = yield* getProjectDir();
        expect(result).toBe(path.join(process.cwd(), ".axm"));
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns an absolute path", () =>
      Effect.gen(function* () {
        const result = yield* getProjectDir();
        expect(path.isAbsolute(result)).toBe(true);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns the same value on repeated calls", () =>
      Effect.gen(function* () {
        const result1 = yield* getProjectDir();
        const result2 = yield* getProjectDir();
        expect(result1).toBe(result2);
      }).pipe(Effect.provide(NodeContext.layer)),
    );
  });

  describe("getAxmDir", () => {
    it.effect("returns global dir when global is true", () =>
      Effect.gen(function* () {
        const result = yield* getAxmDir(true);
        const expected = yield* getGlobalDir();
        expect(result).toBe(expected);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns project dir when global is false", () =>
      Effect.gen(function* () {
        const result = yield* getAxmDir(false);
        const expected = yield* getProjectDir();
        expect(result).toBe(expected);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns an absolute path regardless of scope", () =>
      Effect.gen(function* () {
        const globalResult = yield* getAxmDir(true);
        const projectResult = yield* getAxmDir(false);
        expect(path.isAbsolute(globalResult)).toBe(true);
        expect(path.isAbsolute(projectResult)).toBe(true);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns different paths for global and project scopes", () =>
      Effect.gen(function* () {
        const globalResult = yield* getAxmDir(true);
        const projectResult = yield* getAxmDir(false);
        expect(typeof globalResult).toBe("string");
        expect(typeof projectResult).toBe("string");
        expect(globalResult.endsWith(".axm")).toBe(true);
        expect(projectResult.endsWith(".axm")).toBe(true);
      }).pipe(Effect.provide(NodeContext.layer)),
    );
  });
});
