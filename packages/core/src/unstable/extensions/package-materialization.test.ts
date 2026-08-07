import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
  materializeExternalPackage,
  materializeRegistryPackage,
  type RegistryPackageMaterializationMessages,
} from "./index.js";

const messages: RegistryPackageMaterializationMessages = {
  existsFailureDetail: (canonicalPath) => `failed to check ${canonicalPath}`,
  integrityMismatchCode: "internal",
  integrityMismatchDetail: "integrity mismatch",
  tempDirectoryFailureDetail: "temp failed",
  createDirectoryFailureDetail: (canonicalPath) => `failed to create ${canonicalPath}`,
  inspectExtractedFailureDetail: "inspect failed",
  copyEntryFailureCode: "validation",
  copyEntryFailureDetail: (entry) => `copy failed ${entry}`,
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

  it.effect("reuses an existing registry canonical package when integrity is absent", () =>
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
        nodeFs.mkdirSync(canonicalPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(canonicalPath, "review.md"), "existing");

        const result = yield* materializeRegistryPackage({
          baseDir: workspaceRoot,
          canonicalPath,
          sourceLocation: pathToFileURL(nodePath.join(tempDir, "missing-registry")),
          owner: decodeHandleSync("@acme"),
          type: "hook",
          name: decodeExtensionNameSync("review"),
          version: decodeVersionSync("1.0.0"),
          integrity: Option.none(),
          messages,
        });

        expect(result).toBe(canonicalPath);
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "existing",
        );
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
