import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { canReuseInstalledPackage, materializeExternalPackage } from "./index.js";

const existsFailureDetail = (installedPath: string) => `failed to check ${installedPath}`;

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

  it.effect("reuses an existing registry canonical package when integrity is absent", () =>
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
          integrity: Option.none(),
          version: decodeVersionSync("1.0.0"),
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
          integrity: Option.some("sha512-pinned"),
          version: decodeVersionSync("0.3.0"),
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
          integrity: Option.some("sha512-pinned"),
          version: decodeVersionSync("0.4.0"),
          lockedVersion: "0.3.0",
          existsFailureDetail,
        });

        expect(reuse).toBe(false);
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
