import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { insertSkillCopyFallbackBanner } from "./materialization.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("insertSkillCopyFallbackBanner", () => {
  it.effect("adds a managed banner to copied fallback SKILL.md files", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-skill-banner-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          const canonicalSkillSrcPath = nodePath.join(
            workspaceRoot,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "reviewer",
            "src",
          );
          const agentSkillPath = nodePath.join(workspaceRoot, ".claude", "skills", "reviewer");
          yield* fs.makeDirectory(canonicalSkillSrcPath, { recursive: true });
          yield* fs.makeDirectory(agentSkillPath, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(agentSkillPath, "SKILL.md"),
            `---
name: reviewer
---

Review code.`,
          );

          yield* insertSkillCopyFallbackBanner({
            canonicalSkillSrcPath,
            agentSkillPath,
            baseDir: workspaceRoot,
          });

          const content = yield* fs.readFileString(nodePath.join(agentSkillPath, "SKILL.md"));
          expect(content).toContain("AXM managed file");
          expect(content).toContain("1. Edit: .axm/extensions/@acme/skills/reviewer/src/SKILL.md");
          expect(content).toContain("Learn more: `axm help skills`");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("skips copied skill directories that do not contain SKILL.md", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-skill-no-md-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          const canonicalSkillSrcPath = nodePath.join(
            workspaceRoot,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "reviewer",
            "src",
          );
          const agentSkillPath = nodePath.join(workspaceRoot, ".claude", "skills", "reviewer");
          yield* fs.makeDirectory(canonicalSkillSrcPath, { recursive: true });
          yield* fs.makeDirectory(agentSkillPath, { recursive: true });

          yield* insertSkillCopyFallbackBanner({
            canonicalSkillSrcPath,
            agentSkillPath,
            baseDir: workspaceRoot,
          });

          const exists = yield* fs
            .exists(nodePath.join(agentSkillPath, "SKILL.md"))
            .pipe(Effect.catch(() => Effect.succeed(false)));
          expect(exists).toBe(false);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
