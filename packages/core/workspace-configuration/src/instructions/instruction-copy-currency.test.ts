/**
 * Instruction-copy currency for `cli/projection-currency-follows-state-authority`.
 *
 * The specification lives in
 * `packages/core/workspace-sync/src/projection-currency-follows-state-authority.spec.ts`,
 * where reconciliation decides currency. An instruction copy is written by
 * this feature, not by a reconciliation, and a reconciliation may not import
 * it, so the copy rows run here. They carry every assertion they carried in
 * the specification.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest, previewInstructionsRequest } from "./test-helpers.js";

/** A platform whose symlink creation is refused, so aliases fall back to copies. */
const makeSymlinkRefusingPlatform = () => {
  const rejectedSymlinkTargets: Array<string> = [];
  const layer = Layer.provide(
    Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (filesystem) => ({
        ...filesystem,
        symlink: (_fromPath: string, toPath: string) =>
          Effect.gen(function* () {
            rejectedSymlinkTargets.push(toPath);
            return yield* PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "symlink",
              pathOrDescriptor: toPath,
              description: "This fixture exercises instruction-copy fallback.",
            });
          }),
      })),
    ),
    NodeServices.layer,
  );
  return {
    rejectedSymlinkTargets,
    layer: Layer.provideMerge(layer, NodeServices.layer),
  };
};

describe("Instruction copies follow their source, not their rendered bytes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "preserves rewritten instruction copies until their source changes or the copy is missing",
    () => {
      const platform = makeSymlinkRefusingPlatform();
      const fixture: ConfigurationFixture = makeConfigurationFixture({
        settings: { agents: ["claude-code"] },
        files: { "AGENTS.md": "Initial authored instruction body.\n" },
      });
      cleanups.push(fixture.cleanup);
      const source = path.join(fixture.root, "AGENTS.md");
      const target = path.join(fixture.root, "CLAUDE.md");
      const enable = { action: "enable", fileName: "AGENTS.md", gitignoreAliases: false } as const;

      return fixture
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest(enable);
            expect(platform.rejectedSymlinkTargets.length).toBeGreaterThan(0);
            expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
            const generated = fs.readFileSync(target, "utf8");
            expect(generated).toContain("Initial authored instruction body.");

            const rewritten = generated.replace(
              "Initial authored instruction body.",
              "Repository-formatted instruction body.",
            );
            expect(rewritten).not.toBe(generated);
            fs.writeFileSync(target, rewritten);

            // The copy is current by its source, so neither a preview nor an
            // apply has anything to do with the rewritten bytes.
            const previewed = yield* previewInstructionsRequest(enable);
            expect("outcome" in previewed ? previewed.outcome : "unchanged").toBe("unchanged");
            yield* applyInstructionsRequest(enable);
            expect(fs.readFileSync(target, "utf8")).toBe(rewritten);
            expect(fs.readFileSync(source, "utf8")).toBe("Initial authored instruction body.\n");

            fs.writeFileSync(source, "Revised authored instruction body.\n");
            yield* applyInstructionsRequest(enable);
            const regenerated = fs.readFileSync(target, "utf8");
            expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
            expect(regenerated).toContain("Revised authored instruction body.");
            expect(regenerated).not.toContain("Repository-formatted instruction body.");
            expect(fs.readFileSync(source, "utf8")).toBe("Revised authored instruction body.\n");

            fs.rmSync(target);
            yield* applyInstructionsRequest(enable);
            expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
            expect(fs.readFileSync(target, "utf8")).toBe(regenerated);
            expect(fs.readFileSync(source, "utf8")).toBe("Revised authored instruction body.\n");
          }),
        )
        .pipe(Effect.provide(platform.layer));
    },
  );
});
