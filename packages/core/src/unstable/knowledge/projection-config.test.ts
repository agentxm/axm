import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { resolveKnowledgeProjectionConfig } from "./projection-config.js";

const resolve = (root: string, directory?: string) =>
  resolveKnowledgeProjectionConfig({
    scopeRoot: root,
    axmDir: nodePath.join(root, ".axm"),
    ...(directory === undefined ? {} : { directory }),
  }).pipe(Effect.provide(NodeServices.layer));

describe("resolveKnowledgeProjectionConfig", () => {
  it.effect("defaults to .agents/knowledge relative to the active scope root", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-config-"));
      try {
        const result = yield* resolve(root);

        expect(result).toEqual({
          directory: ".agents/knowledge",
          dir: nodePath.join(root, ".agents", "knowledge"),
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("resolves a custom relative directory", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-config-"));
      try {
        const result = yield* resolve(root, "docs/agent-knowledge");
        expect(result.dir).toBe(nodePath.join(root, "docs", "agent-knowledge"));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  for (const directory of [
    "",
    "   ",
    ".",
    "..",
    "../knowledge",
    "/tmp/knowledge",
    ".axm",
    ".axm/knowledge",
    ".axm/..",
  ]) {
    it.effect(`rejects unsafe directory ${JSON.stringify(directory)}`, () =>
      Effect.gen(function* () {
        const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-config-"));
        try {
          const error = yield* resolve(root, directory).pipe(Effect.flip);
          expect(error.code).toBe("validation");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }),
    );
  }

  it.effect("rejects a configured directory whose existing parent symlink escapes the scope", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-config-"));
      const outside = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-outside-"));
      try {
        mkdirSync(nodePath.join(root, ".agents"), { recursive: true });
        symlinkSync(outside, nodePath.join(root, ".agents", "knowledge"), "dir");

        const error = yield* resolve(root).pipe(Effect.flip);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain("outside the active scope root");
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    }),
  );
});
