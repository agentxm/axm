import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { AppError } from "../../app-error/index.js";
import { resolveWorkspaceExtensionRef } from "./workspace-ref.js";

const makeSkillPackage = (baseDir: string, manifest: Readonly<Record<string, unknown>>): string => {
  const packageDir = path.join(baseDir, ".axm", "extensions", "@acme", "skills", "review");
  fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(packageDir, "skill.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(packageDir, "src", "SKILL.md"), "# Review\n");
  return packageDir;
};

describe("resolveWorkspaceExtensionRef", () => {
  it.effect("resolves and hashes the canonical package without a source provider", () =>
    Effect.gen(function* () {
      const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-workspace-ref-"));
      try {
        const packageDir = makeSkillPackage(baseDir, {
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.2.3",
        });

        const ref = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace:@acme/skills/review",
          expectedType: "skill",
          baseDir,
          scope: "project",
        }).pipe(Effect.provide(NodeServices.layer));

        expect(ref.type).toBe("skill");
        expect(ref.refType).toBe("workspace");
        expect(ref.location).toBe(packageDir);
        expect(ref.version).toBe("1.2.3");
        expect(ref.sourceHash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects a manifest identity that does not match the locator", () =>
    Effect.gen(function* () {
      const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-workspace-ref-"));
      try {
        makeSkillPackage(baseDir, {
          owner: "@other",
          type: "skill",
          name: "review",
          version: "1.2.3",
        });

        const error = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace:@acme/skills/review",
          expectedType: "skill",
          baseDir,
          scope: "project",
        }).pipe(Effect.provide(NodeServices.layer), Effect.flip);

        expect(error).toBeInstanceOf(AppError);
        expect(error.detail).toContain("manifest identity");
      } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects a missing canonical package with workspace-specific guidance", () =>
    Effect.gen(function* () {
      const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-workspace-ref-"));
      try {
        const error = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace:@acme/skills/review",
          expectedType: "skill",
          baseDir,
          scope: "project",
        }).pipe(Effect.provide(NodeServices.layer), Effect.flip);

        expect(error).toBeInstanceOf(AppError);
        expect(error.detail).toContain("canonical package is missing");
      } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    }),
  );
});
