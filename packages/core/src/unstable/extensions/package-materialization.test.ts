import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import {
  CANONICAL_MATERIALIZATION_MARKER_FILENAME,
  canReuseInstalledPackage,
  canonicalMaterializationPaths,
  computePackageContentHash,
  materializeExternalPackage,
  replaceCanonicalDirectory,
} from "./index.js";

const existsFailureDetail = (installedPath: string) => `failed to check ${installedPath}`;

const registryIdentity = {
  refType: "registry" as const,
  owner: "@acme",
  type: "hook" as const,
  name: "review",
  version: "1.0.0",
  publisherBindingId: "hbnd_acme",
  integrity: "sha512-review",
};

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

  it.effect("does not reuse a canonical directory without a completion marker", () =>
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
        nodeFs.mkdirSync(installedPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(installedPath, "review.md"), "existing");

        const reuse = yield* canReuseInstalledPackage({
          installedPath,
          force: false,
          identity: { ...registryIdentity, integrity: null },
          existsFailureDetail,
        });

        expect(reuse).toBe(false);
      }),
    ),
  );

  it.effect("reuses a complete canonical directory with matching accepted identity", () =>
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
          identity: registryIdentity,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "complete");
            }),
        });

        const reuse = yield* canReuseInstalledPackage({
          installedPath,
          force: false,
          identity: registryIdentity,
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
          identity: {
            ...registryIdentity,
            type: "knowledge",
            name: "handbook",
            version: "0.3.0",
            integrity: "sha512-pinned",
          },
          lockedVersion: "0.3.0",
          existsFailureDetail,
        });

        expect(reuse).toBe(false);
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
          identity: {
            ...registryIdentity,
            type: "knowledge",
            name: "handbook",
            version: "0.4.0",
            integrity: "sha512-pinned",
          },
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
          identity: registryIdentity,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });

        const failure = yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          identity: { ...registryIdentity, version: "2.0.0", integrity: "sha512-next" },
          populate: (stagingPath) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                nodeFs.mkdirSync(stagingPath, { recursive: true });
                nodeFs.writeFileSync(nodePath.join(stagingPath, "partial.txt"), "partial");
              });
              expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
                "prior",
              );
              return yield* makeAppError({ code: "internal", detail: "injected staging failure" });
            }),
        }).pipe(Effect.flip);

        expect(failure.detail).toBe("injected staging failure");
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
          identity: registryIdentity,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });

        const failure = yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          identity: { ...registryIdentity, version: "2.0.0", integrity: "sha512-next" },
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
              return yield* makeAppError({
                code: "validation",
                detail: "injected validation failure",
              });
            }),
        }).pipe(Effect.flip);

        expect(failure.detail).toBe("injected validation failure");
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
          identity: registryIdentity,
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
          identity: { ...registryIdentity, version: "2.0.0", integrity: "sha512-next" },
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
          identity: registryIdentity,
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
          identity: registryIdentity,
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

  it.effect("discards a stale complete staging tree before the next replacement", () =>
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
        nodeFs.writeFileSync(
          nodePath.join(stagingPath, CANONICAL_MATERIALIZATION_MARKER_FILENAME),
          JSON.stringify({ schemaVersion: 1, identity: registryIdentity }),
        );

        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          identity: registryIdentity,
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

  it.effect("does not reuse a replaced tree against prior persisted state", () =>
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
        const nextIdentity = { ...registryIdentity, version: "2.0.0", integrity: "sha512-next" };
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          identity: nextIdentity,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "next");
            }),
        });

        const reuse = yield* canReuseInstalledPackage({
          installedPath: canonicalPath,
          force: false,
          identity: registryIdentity,
          lockedVersion: "1.0.0",
          existsFailureDetail,
        });

        expect(reuse).toBe(false);
      }),
    ),
  );

  it.effect("excludes the completion marker from package content identity", () =>
    run(
      Effect.gen(function* () {
        const packagePath = nodePath.join(workspaceRoot, "package");
        nodeFs.mkdirSync(packagePath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(packagePath, "hook.json"), "{}");
        const before = yield* computePackageContentHash(packagePath);
        nodeFs.writeFileSync(
          nodePath.join(packagePath, CANONICAL_MATERIALIZATION_MARKER_FILENAME),
          JSON.stringify({ schemaVersion: 1, identity: registryIdentity }),
        );
        const after = yield* computePackageContentHash(packagePath);

        expect(after).toBe(before);
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
});
