import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { AppError } from "../../app-error/index.js";
import { handle } from "../../test-helpers.js";
import { makeAbsolutePath } from "../../utils/path-types.js";
import { resolveProjectWorkspaceLayout } from "../layout.js";
import { resolveWorkspaceExtensionRef } from "./workspace-ref.js";

const makeSkillPackage = (baseDir: string, manifest: Readonly<Record<string, unknown>>): string => {
  const packageDir = path.join(baseDir, "skills", "review");
  fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(packageDir, "skill.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(packageDir, "src", "SKILL.md"), "# Review\n");
  return packageDir;
};

layer(NodeServices.layer, { excludeTestServices: true })("resolveWorkspaceExtensionRef", (it) => {
  it.effect("resolves and hashes the canonical package without a source provider", () =>
    Effect.gen(function* () {
      const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-workspace-ref-"));
      try {
        const pathService = yield* Path.Path;
        const layout = yield* resolveProjectWorkspaceLayout(
          makeAbsolutePath(pathService, baseDir),
          { owner: handle("@acme") },
        );
        const packageDir = makeSkillPackage(baseDir, {
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.2.3",
        });

        const ref = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace",
          expectedType: "skill",
          layout,
          scope: "project",
        });

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
        const pathService = yield* Path.Path;
        const layout = yield* resolveProjectWorkspaceLayout(
          makeAbsolutePath(pathService, baseDir),
          { owner: handle("@acme") },
        );
        makeSkillPackage(baseDir, {
          owner: "@other",
          type: "skill",
          name: "review",
          version: "1.2.3",
        });

        const error = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace",
          expectedType: "skill",
          layout,
          scope: "project",
        }).pipe(Effect.flip);

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
        const pathService = yield* Path.Path;
        const layout = yield* resolveProjectWorkspaceLayout(
          makeAbsolutePath(pathService, baseDir),
          { owner: handle("@acme") },
        );
        const error = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace",
          expectedType: "skill",
          layout,
          scope: "project",
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(AppError);
        expect(error.detail).toContain("canonical package is missing");
      } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    }),
  );
});
