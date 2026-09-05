import * as nodeFs from "node:fs";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  canReuseExternalPackage,
  canReuseInstalledPackage,
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackage,
  replaceCanonicalDirectory,
} from "./canonical-directory.js";
import * as Data from "effect/Data";

class InjectedFailure extends Data.TaggedError("InjectedFailure")<{
  readonly detail: string;
}> {}

const existsFailureDetail = (installedPath: string) => `failed to check ${installedPath}`;

const pinnedRef = { refVersion: "1.0.0", hasIntegrity: true };

describe("package materialization helpers", () => {
  let tempDir: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-package-materialization-"));
    workspaceRoot = nodePath.join(tempDir, "workspace");
    nodeFs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("reuses an existing tree for a ref without pinned integrity", () =>
    run(
      Effect.gen(function* () {
        // Synthetic refs from publish carry no integrity, so an existing tree
        // is accepted as-is rather than re-materialized.
        const installedPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        nodeFs.mkdirSync(installedPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(installedPath, "review.md"), "existing");

        const reuse = yield* canReuseInstalledPackage({
          installedPath,
          force: false,
          refVersion: "1.0.0",
          hasIntegrity: false,
          existsFailureDetail,
        });

        expect(reuse).toBe(true);
      }),
    ),
  );

  it.effect(
    "reuses a complete canonical directory when the lockfile pins the requested version",
    () =>
      run(
        Effect.gen(function* () {
          const installedPath = nodePath.join(
            workspaceRoot,
            ".axm",
            "extensions",
            "@acme",
            "hooks",
            "review",
          );
          yield* replaceCanonicalDirectory({
            baseDir: workspaceRoot,
            canonicalPath: installedPath,
            populate: (stagingPath) =>
              Effect.sync(() => {
                nodeFs.mkdirSync(stagingPath, { recursive: true });
                nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "complete");
              }),
          });

          const reuse = yield* canReuseInstalledPackage({
            installedPath,
            force: false,
            ...pinnedRef,
            lockedVersion: "1.0.0",
            existsFailureDetail,
          });

          expect(reuse).toBe(true);
        }),
      ),
  );

  it.effect("decides reuse from the installed tree, not the staging destination", () =>
    run(
      Effect.gen(function* () {
        // Regression: knowledge installs extract into a temporary staging
        // directory and swap it into place. When the reuse decision was made
        // against that staging path it was always absent, so every update
        // re-extracted and reverted workspace-owned edits.
        const installedPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "knowledge",
          "handbook",
        );
        nodeFs.mkdirSync(installedPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(installedPath, "index.md"), "locally formatted");
        const stagingDestination = nodePath.join(tempDir, "staging", "staged");

        const reuse = yield* canReuseInstalledPackage({
          installedPath,
          force: false,
          refVersion: "0.3.0",
          hasIntegrity: true,
          lockedVersion: "0.3.0",
          existsFailureDetail,
        });

        expect(reuse).toBe(true);
        expect(nodeFs.existsSync(stagingDestination)).toBe(false);
        expect(nodeFs.readFileSync(nodePath.join(installedPath, "index.md"), "utf8")).toBe(
          "locally formatted",
        );
      }),
    ),
  );

  it.effect("re-materializes when the installed tree is behind the requested version", () =>
    run(
      Effect.gen(function* () {
        const installedPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "knowledge",
          "handbook",
        );
        nodeFs.mkdirSync(installedPath, { recursive: true });

        const reuse = yield* canReuseInstalledPackage({
          installedPath,
          force: false,
          refVersion: "0.4.0",
          hasIntegrity: true,
          lockedVersion: "0.3.0",
          existsFailureDetail,
        });

        expect(reuse).toBe(false);
      }),
    ),
  );

  it.effect("keeps the prior complete tree visible while staging and after staging fails", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });

        const failure = yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                nodeFs.mkdirSync(stagingPath, { recursive: true });
                nodeFs.writeFileSync(nodePath.join(stagingPath, "partial.txt"), "partial");
              });
              expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
                "prior",
              );
              return yield* new InjectedFailure({ detail: "injected staging failure" });
            }),
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "InjectedFailure",
          detail: "injected staging failure",
        });
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "prior",
        );
        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "partial.txt"))).toBe(false);
      }),
    ),
  );

  it.effect("keeps the prior complete tree when staged package validation fails", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });

        const failure = yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "invalid next");
            }),
          validate: (stagingPath) =>
            Effect.gen(function* () {
              expect(nodeFs.readFileSync(nodePath.join(stagingPath, "review.md"), "utf8")).toBe(
                "invalid next",
              );
              return yield* new InjectedFailure({ detail: "injected validation failure" });
            }),
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "InjectedFailure",
          detail: "injected validation failure",
        });
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "prior",
        );
        expect(nodeFs.existsSync(canonicalMaterializationPaths(canonicalPath).stagingPath)).toBe(
          false,
        );
      }),
    ),
  );

  it.effect("recovers a complete prior tree after interruption during replacement", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });
        const paths = canonicalMaterializationPaths(canonicalPath);
        nodeFs.renameSync(canonicalPath, paths.backupPath);
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial");

        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
                "prior",
              );
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "next");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe("next");
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("recovers the prior tree before deciding reuse after a replacement interruption", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });
        const paths = canonicalMaterializationPaths(canonicalPath);
        nodeFs.renameSync(canonicalPath, paths.backupPath);
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial");

        const reuse = yield* canReuseInstalledPackage({
          installedPath: canonicalPath,
          force: false,
          ...pinnedRef,
          lockedVersion: "1.0.0",
          existsFailureDetail,
        });

        expect(reuse).toBe(true);
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "prior",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("discards a stale staging tree before the next replacement", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        const { stagingPath } = canonicalMaterializationPaths(canonicalPath);
        nodeFs.mkdirSync(stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(stagingPath, "stale.txt"), "stale");

        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (freshStagingPath) =>
            Effect.sync(() => {
              expect(nodeFs.existsSync(nodePath.join(freshStagingPath, "stale.txt"))).toBe(false);
              nodeFs.mkdirSync(freshStagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(freshStagingPath, "review.md"), "fresh");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "fresh",
        );
        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "stale.txt"))).toBe(false);
      }),
    ),
  );

  it.effect("publishes a create-only package after discarding stale staging", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "rules",
          "review",
        );
        const paths = canonicalMaterializationPaths(canonicalPath);
        const unrelatedSibling = `${canonicalPath}.notes`;
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial");
        nodeFs.mkdirSync(unrelatedSibling, { recursive: true });

        yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Rule",
          requiredFiles: ["rule.json", "src/RULE.md"],
          populate: (stagingPath) =>
            Effect.sync(() => {
              expect(nodeFs.existsSync(nodePath.join(stagingPath, "partial.txt"))).toBe(false);
              nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "rule.json"), "{}\n");
              nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "RULE.md"), "complete\n");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "src", "RULE.md"), "utf8")).toBe(
          "complete\n",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
        expect(nodeFs.existsSync(unrelatedSibling)).toBe(true);
      }),
    ),
  );

  it.effect("restores interrupted create state before reporting a collision", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "skills",
          "review",
        );
        const paths = canonicalMaterializationPaths(canonicalPath);
        nodeFs.mkdirSync(paths.backupPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.backupPath, "skill.json"), "prior\n");
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial\n");

        const failure = yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Skill",
          populate: () => Effect.void,
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("CreateDestinationExists");
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "skill.json"), "utf8")).toBe(
          "prior\n",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("keeps create-only destinations absent until required files validate", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        const paths = canonicalMaterializationPaths(canonicalPath);

        const failure = yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Hook",
          requiredFiles: ["hook.json", "src/index.ts"],
          populate: (stagingPath) =>
            Effect.sync(() => nodeFs.writeFileSync(nodePath.join(stagingPath, "hook.json"), "{}")),
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("StagedPackageInvalid");
        expect(nodeFs.existsSync(canonicalPath)).toBe(false);
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);

        yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Hook",
          requiredFiles: ["hook.json", "src/index.ts"],
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "hook.json"), "{}");
              nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "index.ts"), "export {};");
            }),
        });

        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "src", "index.ts"))).toBe(true);
      }),
    ),
  );

  it.effect("recovers after hard process death during create-only staging", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "knowledge",
          "review",
        );
        const fixture = fileURLToPath(
          new URL("./__fixtures__/interrupted-package-create.mjs", import.meta.url),
        );
        const child = spawnSync(process.execPath, [fixture, canonicalPath]);
        const paths = canonicalMaterializationPaths(canonicalPath);

        expect(child.signal).toBe("SIGKILL");
        expect(nodeFs.existsSync(canonicalPath)).toBe(false);
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(true);

        yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Knowledge bundle",
          requiredFiles: ["package.json", "src/content.md"],
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "package.json"), "{}\n");
              nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "content.md"), "retried\n");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "src", "content.md"), "utf8")).toBe(
          "retried\n",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("copies an external package into the canonical path", () =>
    run(
      Effect.gen(function* () {
        const sourcePath = nodePath.join(tempDir, "source");
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "external",
          "hooks",
          "audit",
        );
        nodeFs.mkdirSync(nodePath.join(sourcePath, "src"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(sourcePath, "src", "hook.sh"), "#!/usr/bin/env bash\n");
        nodeFs.mkdirSync(canonicalPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(canonicalPath, "stale.txt"), "stale");

        const result = yield* materializeExternalPackage({
          baseDir: workspaceRoot,
          canonicalPath,
          sourceLocation: pathToFileURL(sourcePath).href,
          copyFailureCode: "validation",
          copyFailureDetail: (target) => `failed to copy to ${target}`,
        });

        expect(result).toBe(canonicalPath);
        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "stale.txt"))).toBe(false);
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "src", "hook.sh"), "utf8")).toBe(
          "#!/usr/bin/env bash\n",
        );
      }),
    ),
  );

  it.effect("reuses completed external canonical content until refresh is forced", () =>
    run(
      Effect.gen(function* () {
        const sourcePath = nodePath.join(tempDir, "source");
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "external",
          "skills",
          "review",
        );
        nodeFs.mkdirSync(sourcePath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(sourcePath, "SKILL.md"), "source");
        yield* materializeExternalPackage({
          baseDir: workspaceRoot,
          canonicalPath,
          sourceLocation: sourcePath,
          copyFailureCode: "validation",
          copyFailureDetail: (target) => `failed to copy to ${target}`,
        });
        nodeFs.writeFileSync(nodePath.join(sourcePath, "SKILL.md"), "changed source");

        expect(
          yield* canReuseExternalPackage({
            installedPath: canonicalPath,
            force: false,
            existsFailureDetail,
          }),
        ).toBe(true);
        expect(
          yield* canReuseExternalPackage({
            installedPath: canonicalPath,
            force: true,
            existsFailureDetail,
          }),
        ).toBe(false);
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "SKILL.md"), "utf8")).toBe(
          "source",
        );
      }),
    ),
  );
});
