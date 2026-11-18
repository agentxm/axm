import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { ManifestError, readExtensionManifest } from "@agentxm/extension-content";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { workObservations } from "../../../locations/testing.js";
import { WorkspaceSourceInvalid } from "../errors.js";
import { computePackageContentHash } from "../package-hash.js";
import { handle } from "../../testing.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
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

        expect(error).toBeInstanceOf(WorkspaceSourceInvalid);
        if (error instanceof WorkspaceSourceInvalid) {
          expect(error.detail).toContain("manifest identity");
        }
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

        expect(error).toBeInstanceOf(WorkspaceSourceInvalid);
        if (error instanceof WorkspaceSourceInvalid) {
          expect(error.detail).toContain("canonical package is missing");
        }
      } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    }),
  );

  /** A project workspace holding a valid `@acme/skills/review` package. */
  const reviewWorkspace = Effect.gen(function* () {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-workspace-ref-"));
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => fs.rmSync(baseDir, { recursive: true, force: true })),
    );
    const pathService = yield* Path.Path;
    const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(pathService, baseDir), {
      owner: handle("@acme"),
    });
    const packageDir = makeSkillPackage(baseDir, {
      owner: "@acme",
      type: "skill",
      name: "review",
      version: "1.2.3",
    });
    return { layout, packageDir };
  });

  /** Package evidence a caller settled earlier, counting each evaluation. */
  const countedEvidence = (args: {
    readonly root: string;
    readonly type: ExtensionType;
    readonly manifest: ReturnType<typeof readExtensionManifest<ExtensionType>>;
  }) =>
    Effect.gen(function* () {
      const manifestEvaluations = yield* Ref.make(0);
      const hashEvaluations = yield* Ref.make(0);
      const hash = yield* computePackageContentHash(args.root);
      return {
        manifestEvaluations,
        hashEvaluations,
        hash,
        prepared: {
          root: args.root,
          type: args.type,
          manifest: Ref.update(manifestEvaluations, (count) => count + 1).pipe(
            Effect.andThen(args.manifest),
          ),
          hash: Ref.update(hashEvaluations, (count) => count + 1).pipe(Effect.as(hash)),
        },
      };
    });

  it.effect("uses the package evidence its caller settled for the same root and type", () =>
    Effect.gen(function* () {
      const { layout, packageDir } = yield* reviewWorkspace;
      const evidence = yield* countedEvidence({
        root: packageDir,
        type: "skill",
        manifest: readExtensionManifest<ExtensionType>(packageDir, "skill"),
      });
      const work = workObservations(false);

      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: "review",
        source: "workspace",
        expectedType: "skill",
        layout,
        scope: "project",
        prepared: evidence.prepared,
      }).pipe(work.provide);

      expect(ref.version).toBe("1.2.3");
      expect(ref.sourceHash).toBe(evidence.hash);
      expect(yield* Ref.get(evidence.manifestEvaluations)).toBe(1);
      expect(yield* Ref.get(evidence.hashEvaluations)).toBe(1);
      expect(work.facts.filter((fact) => fact.kind === "axm.hash.package")).toHaveLength(0);
    }),
  );

  for (const mismatch of ["root", "type"] as const)
    it.effect(`reads the package itself when the settled evidence names another ${mismatch}`, () =>
      Effect.gen(function* () {
        const { layout, packageDir } = yield* reviewWorkspace;
        const evidence = yield* countedEvidence({
          root: packageDir,
          type: mismatch === "type" ? "rule" : "skill",
          manifest: readExtensionManifest<ExtensionType>(packageDir, "skill"),
        });
        const work = workObservations(false);

        const ref = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace",
          expectedType: "skill",
          layout,
          scope: "project",
          prepared:
            mismatch === "root"
              ? { ...evidence.prepared, root: path.join(packageDir, "elsewhere") }
              : evidence.prepared,
        }).pipe(work.provide);

        expect(ref.version).toBe("1.2.3");
        expect(yield* Ref.get(evidence.manifestEvaluations)).toBe(0);
        expect(yield* Ref.get(evidence.hashEvaluations)).toBe(0);
        expect(work.facts.filter((fact) => fact.kind === "axm.hash.package")).toHaveLength(1);
      }),
    );

  const manifestFailures = [
    { code: "manifest_missing", detail: "the expected manifest is missing at" },
    { code: "manifest_unreadable", detail: "the expected manifest is missing at" },
    { code: "manifest_invalid_json", detail: "is not valid JSON" },
    { code: "manifest_schema_invalid", detail: "is invalid" },
  ] as const;

  for (const failure of manifestFailures)
    it.effect(`reports a settled ${failure.code} manifest failure as an invalid source`, () =>
      Effect.gen(function* () {
        const { layout, packageDir } = yield* reviewWorkspace;
        const cause = new ManifestError({ code: failure.code, detail: "settled failure" });
        const evidence = yield* countedEvidence({
          root: packageDir,
          type: "skill",
          manifest: Effect.fail(cause),
        });

        const error = yield* resolveWorkspaceExtensionRef({
          settingsName: "review",
          source: "workspace",
          expectedType: "skill",
          layout,
          scope: "project",
          prepared: evidence.prepared,
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(WorkspaceSourceInvalid);
        if (error instanceof WorkspaceSourceInvalid) {
          expect(error.detail).toContain(failure.detail);
          expect(error.detail).toContain(path.join(packageDir, "skill.json"));
          expect(error.cause).toBe(cause);
        }
        expect(yield* Ref.get(evidence.hashEvaluations)).toBe(0);
      }),
    );
});
