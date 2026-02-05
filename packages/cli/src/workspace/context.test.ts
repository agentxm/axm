/**
 * Unit tests for workspace context module.
 *
 * Tests the makeWorkspaceContext function that creates workspace context
 * from handler options (global vs local scope, interactive mode).
 *
 * Also tests ensureInit which checks if a workspace is initialized.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAxmDir } from "./paths.js";
import {
  ensureInit,
  makeWorkspaceContext,
  type WorkspaceContext,
  WorkspaceError,
} from "./context.js";

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

describe("makeWorkspaceContext", () => {
  describe("path resolution", () => {
    it("returns local path when global is false", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: true });

      expect(ctx.path).toBe(getAxmDir(false));
    });

    it("returns global path when global is true", () => {
      const ctx = makeWorkspaceContext({ global: true, interactive: true });

      expect(ctx.path).toBe(getAxmDir(true));
    });

    it("returns path ending in .axm", () => {
      const localCtx = makeWorkspaceContext({ global: false, interactive: true });
      const globalCtx = makeWorkspaceContext({ global: true, interactive: true });

      expect(localCtx.path.endsWith(".axm")).toBe(true);
      expect(globalCtx.path.endsWith(".axm")).toBe(true);
    });
  });

  describe("interactive mode", () => {
    it("passes through interactive true", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: true });

      expect(ctx.interactive).toBe(true);
    });

    it("passes through interactive false", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: false });

      expect(ctx.interactive).toBe(false);
    });
  });

  describe("combinations", () => {
    it("local non-interactive", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: false });

      expect(ctx.path).toBe(getAxmDir(false));
      expect(ctx.interactive).toBe(false);
    });

    it("local interactive", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: true });

      expect(ctx.path).toBe(getAxmDir(false));
      expect(ctx.interactive).toBe(true);
    });

    it("global non-interactive", () => {
      const ctx = makeWorkspaceContext({ global: true, interactive: false });

      expect(ctx.path).toBe(getAxmDir(true));
      expect(ctx.interactive).toBe(false);
    });

    it("global interactive", () => {
      const ctx = makeWorkspaceContext({ global: true, interactive: true });

      expect(ctx.path).toBe(getAxmDir(true));
      expect(ctx.interactive).toBe(true);
    });
  });

  describe("return type", () => {
    it("returns object with readonly path", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: true });

      expect(typeof ctx.path).toBe("string");
    });

    it("returns object with readonly interactive", () => {
      const ctx = makeWorkspaceContext({ global: false, interactive: true });

      expect(typeof ctx.interactive).toBe("boolean");
    });
  });
});

// =============================================================================
// ensureInit tests
// =============================================================================

describe("WorkspaceError", () => {
  it("has correct _tag", () => {
    const error = new WorkspaceError({
      message: "test error",
    });

    expect(error._tag).toBe("WorkspaceError");
  });

  it("contains message", () => {
    const error = new WorkspaceError({
      message: "workspace not found",
    });

    expect(error.message).toBe("workspace not found");
  });
});

describe("ensureInit", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(tmpBase, `axm-workspace-test-${Date.now()}`);
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  describe("when workspace is initialized", () => {
    it("succeeds when .axm directory exists with settings.json", async () => {
      // Arrange: Create initialized workspace
      const axmDir = nodePath.join(tempDir, ".axm");
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(axmDir, "settings.json"),
            JSON.stringify({ scope: "@test" }),
          );
        }),
      );

      const ctx: WorkspaceContext = {
        path: axmDir,
        interactive: false,
      };

      // Act & Assert: Should succeed
      await expect(runEffect(ensureInit(ctx))).resolves.toBeUndefined();
    });

    it("succeeds when settings.json is empty object", async () => {
      const axmDir = nodePath.join(tempDir, ".axm");
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          yield* fs.writeFileString(nodePath.join(axmDir, "settings.json"), "{}");
        }),
      );

      const ctx: WorkspaceContext = {
        path: axmDir,
        interactive: false,
      };

      await expect(runEffect(ensureInit(ctx))).resolves.toBeUndefined();
    });
  });

  describe("when workspace is not initialized", () => {
    it("fails when .axm directory does not exist (non-interactive)", async () => {
      const axmDir = nodePath.join(tempDir, ".axm");
      const ctx: WorkspaceContext = {
        path: axmDir,
        interactive: false,
      };

      // Act & Assert: Should fail with WorkspaceError
      await expect(runEffect(ensureInit(ctx).pipe(Effect.flip))).resolves.toMatchObject({
        _tag: "WorkspaceError",
        message: expect.stringContaining("not initialized"),
      });
    });

    it("fails when settings.json does not exist (non-interactive)", async () => {
      const axmDir = nodePath.join(tempDir, ".axm");
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          // No settings.json created
        }),
      );

      const ctx: WorkspaceContext = {
        path: axmDir,
        interactive: false,
      };

      await expect(runEffect(ensureInit(ctx).pipe(Effect.flip))).resolves.toMatchObject({
        _tag: "WorkspaceError",
        message: expect.stringContaining("not initialized"),
      });
    });

    it("fails when parent directory does not exist (non-interactive)", async () => {
      const nonExistentDir = nodePath.join(tempDir, "does", "not", "exist", ".axm");
      const ctx: WorkspaceContext = {
        path: nonExistentDir,
        interactive: false,
      };

      await expect(runEffect(ensureInit(ctx).pipe(Effect.flip))).resolves.toMatchObject({
        _tag: "WorkspaceError",
      });
    });
  });

  describe("interactive mode behavior", () => {
    it("fails with same error in interactive mode when not initialized", async () => {
      // Note: For now, interactive mode behaves the same as non-interactive.
      // Future implementation could prompt for initialization.
      const axmDir = nodePath.join(tempDir, ".axm");
      const ctx: WorkspaceContext = {
        path: axmDir,
        interactive: true,
      };

      await expect(runEffect(ensureInit(ctx).pipe(Effect.flip))).resolves.toMatchObject({
        _tag: "WorkspaceError",
        message: expect.stringContaining("not initialized"),
      });
    });
  });
});
