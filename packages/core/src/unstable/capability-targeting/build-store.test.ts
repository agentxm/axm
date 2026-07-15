import { describe, expect, it } from "@effect/vitest";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { materializeCapabilityTargetedBuild } from "./build-store.js";
import { capabilityRenderTargetForAgentId } from "./profile.js";

const withFixture = <A, E>(
  content: string,
  run: (fixture: {
    readonly baseDir: string;
    readonly sourceDir: string;
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  }) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = yield* fs.makeTempDirectoryScoped();
    const sourceDir = path.join(baseDir, ".axm", "extensions", "@acme", "skills", "review", "src");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "SKILL.md"), content);
    return yield* run({ baseDir, sourceDir, fs, path });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("materializeCapabilityTargetedBuild", () => {
  it.effect("keeps directive-free skills on the canonical sharing path", () =>
    withFixture("# Review\n\nReview directly.\n", ({ baseDir, sourceDir }) =>
      Effect.gen(function* () {
        const result = yield* materializeCapabilityTargetedBuild({
          baseDir,
          canonicalSourcePath: sourceDir,
          extensionName: "review",
          target: capabilityRenderTargetForAgentId("codex"),
        });

        expect(result.artifactSourcePath).toBe(sourceDir);
        expect(result.didRender).toBe(false);
        expect(result.renderInput).toBeUndefined();
      }),
    ),
  );

  it.effect("writes targeted markdown to an immutable content-addressed build", () =>
    withFixture(
      [
        "# Review",
        "",
        '<axm-region id="review">',
        "Review directly.",
        "</axm-region>",
        '<axm-enhance when="subagents" replaces="review">',
        "Delegate the review.",
        "</axm-enhance>",
        "",
      ].join("\n"),
      ({ baseDir, sourceDir, fs, path }) =>
        Effect.gen(function* () {
          const result = yield* materializeCapabilityTargetedBuild({
            baseDir,
            canonicalSourcePath: sourceDir,
            extensionName: "review",
            target: capabilityRenderTargetForAgentId("codex"),
          });

          expect(result.artifactSourcePath).not.toBe(sourceDir);
          expect(result.artifactSourcePath).toContain(".axm/build/skills/review/");
          expect(yield* fs.readFileString(path.join(result.artifactSourcePath, "SKILL.md"))).toBe(
            "# Review\n\nDelegate the review.\n",
          );
          expect(result.renderInput?.agent).toBe("codex");
          expect(result.renderInput?.referencedCapabilities).toEqual(["subagents"]);
          expect(result.degraded).toBe(false);
        }),
    ),
  );

  it.effect("records malformed-source verbatim fallback as degraded", () =>
    withFixture(
      '<axm-variants>\n<axm-variant when="subagents">\nDelegate.\n</axm-variant>\n</axm-variants>\n',
      ({ baseDir, sourceDir, fs, path }) =>
        Effect.gen(function* () {
          const result = yield* materializeCapabilityTargetedBuild({
            baseDir,
            canonicalSourcePath: sourceDir,
            extensionName: "review",
            target: capabilityRenderTargetForAgentId("codex"),
          });

          expect(result.degraded).toBe(true);
          expect(result.findings.map((item) => item.code)).toContain("missing-default-variant");
          expect(yield* fs.readFileString(path.join(result.artifactSourcePath, "SKILL.md"))).toBe(
            '<axm-variants>\n<axm-variant when="subagents">\nDelegate.\n</axm-variant>\n</axm-variants>\n',
          );
        }),
    ),
  );

  it.effect("leaves formatter-equivalent output untouched and reports semantic drift", () =>
    withFixture(
      '# Review\n\n<axm-enhance agent="codex">\nUse *care* when reviewing a long line.\n</axm-enhance>\n',
      ({ baseDir, sourceDir, fs, path }) =>
        Effect.gen(function* () {
          const args = {
            baseDir,
            canonicalSourcePath: sourceDir,
            extensionName: "review",
            target: capabilityRenderTargetForAgentId("codex"),
          };
          const first = yield* materializeCapabilityTargetedBuild(args);
          const output = path.join(first.artifactSourcePath, "SKILL.md");
          const reformatted = "# Review\n\nUse _care_ when reviewing a\nlong line.\n";
          yield* fs.writeFileString(output, reformatted);

          const equivalent = yield* materializeCapabilityTargetedBuild(args);
          expect(equivalent.findings).toEqual([]);
          expect(yield* fs.readFileString(output)).toBe(reformatted);

          yield* fs.writeFileString(output, "# Review\n\nSkip the review.\n");
          const drifted = yield* materializeCapabilityTargetedBuild(args);
          expect(drifted.findings.map((item) => item.code)).toContain("rendered-artifact-drift");
          expect(yield* fs.readFileString(output)).toBe("# Review\n\nSkip the review.\n");
        }),
    ),
  );
});
