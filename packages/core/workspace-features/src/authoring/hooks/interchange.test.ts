import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { NATIVE_HOOK_BUNDLE_METADATA, prepareNativeHookImport } from "./interchange.js";

// Every case reads a real bundle directory: the claims concern which
// filesystem calls the optional metadata costs and which failure each
// unreadable entry reports.
const services = Layer.merge(NativePlatformTest, layerRecordingFileSystem(NativePlatformTest));

const metadata = (protocol = "claude-code") =>
  JSON.stringify({
    format: "axm-native-hook-bundle",
    version: 1,
    protocol,
    resources: ["data/shared.txt"],
    source: { fqn: "@acme/hooks/audit", version: "1.0.0", implementation: "claude" },
    executionRoot: "bundle-root",
  });

describe("native Hook import metadata", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A native bundle whose metadata entry the case arranges. */
  const bundle = (arrange: (metadataPath: string) => void) => {
    const root = nodeFs.realpathSync(
      nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "hook-import-")),
    );
    cleanups.push(() => {
      const metadataPath = nodePath.join(root, NATIVE_HOOK_BUNDLE_METADATA);
      if (nodeFs.lstatSync(metadataPath, { throwIfNoEntry: false })?.isFile() === true)
        nodeFs.chmodSync(metadataPath, 0o644);
      nodeFs.rmSync(root, { recursive: true, force: true });
    });
    nodeFs.writeFileSync(
      nodePath.join(root, "hooks.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "bash src/audit.sh", timeout: 5 }],
            },
          ],
        },
      }),
    );
    nodeFs.mkdirSync(nodePath.join(root, "src"));
    nodeFs.writeFileSync(nodePath.join(root, "src/audit.sh"), "#!/bin/bash\n");
    nodeFs.mkdirSync(nodePath.join(root, "data"));
    nodeFs.writeFileSync(nodePath.join(root, "data/shared.txt"), "shared\n");
    const metadataPath = nodePath.join(root, NATIVE_HOOK_BUNDLE_METADATA);
    arrange(metadataPath);
    return { root, metadataPath };
  };

  /** Import the bundle, returning its outcome and the calls made on the metadata entry. */
  const importBundle = (root: string, metadataPath: string) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const result = yield* prepareNativeHookImport({
        source: root,
        protocol: "claude-code",
        target: {
          owner: decodeHandleSync("@acme"),
          type: "hook",
          name: decodeExtensionNameSync("audit"),
        },
      }).pipe(Effect.result);
      const calls = recording
        .calls({ path: metadataPath })
        .map((call) => `${call.method}:${call.outcome}`);
      return { result, calls };
    }).pipe(Effect.provide(services));

  /** The identifying fields of the failure an import reports. */
  const failureOf = (outcome: Effect.Success<ReturnType<typeof importBundle>>) => {
    if (outcome.result._tag !== "Failure") throw new Error("Expected the import to fail");
    const error = outcome.result.failure;
    return error._tag === "PlatformError"
      ? {
          reason: error.reason._tag,
          method: error.reason.method,
          ...("syscall" in error.reason
            ? { syscall: error.reason.syscall, pathOrDescriptor: error.reason.pathOrDescriptor }
            : {}),
        }
      : { detail: error.detail };
  };

  it.effect("reads present metadata once, without a separate existence probe", () =>
    Effect.gen(function* () {
      const { root, metadataPath } = bundle((target) => nodeFs.writeFileSync(target, metadata()));

      const { result, calls } = yield* importBundle(root, metadataPath);

      expect(calls).toEqual(["readFile:success"]);
      if (result._tag !== "Success") throw new Error("Expected the bundle to import");
      expect(result.success.manifest.metadata?.["nativeImport"]).toMatchObject({
        source: { fqn: "@acme/hooks/audit", version: "1.0.0", implementation: "claude" },
      });
      expect(result.success.files.map((file) => file.path)).toEqual([
        "data/shared.txt",
        "src/audit.sh",
      ]);
    }),
  );

  it.effect("treats absent metadata as one failed read", () =>
    Effect.gen(function* () {
      const { root, metadataPath } = bundle(() => undefined);

      const { result, calls } = yield* importBundle(root, metadataPath);

      expect(calls).toEqual(["readFile:failure"]);
      if (result._tag !== "Success") throw new Error("Expected the bundle to import");
      expect(result.success.manifest.metadata?.["nativeImport"]).not.toHaveProperty("source");
      expect(result.success.files.map((file) => file.path)).toEqual(["src/audit.sh"]);
    }),
  );

  it.effect("refuses empty metadata as invalid", () =>
    Effect.gen(function* () {
      const { root, metadataPath } = bundle((target) => nodeFs.writeFileSync(target, ""));

      expect(failureOf(yield* importBundle(root, metadataPath))).toEqual({
        detail: "Invalid native Hook bundle metadata.",
      });
    }),
  );

  it.effect("refuses metadata for another protocol", () =>
    Effect.gen(function* () {
      const { root, metadataPath } = bundle((target) =>
        nodeFs.writeFileSync(target, metadata("codex")),
      );

      expect(failureOf(yield* importBundle(root, metadataPath))).toEqual({
        detail: "Native bundle protocol does not match --protocol.",
      });
    }),
  );

  it.effect("reports the read failure of a directory at the metadata path", () =>
    Effect.gen(function* () {
      const { root, metadataPath } = bundle((target) => nodeFs.mkdirSync(target));

      expect(failureOf(yield* importBundle(root, metadataPath))).toEqual({
        reason: "BadResource",
        method: "readFile",
        syscall: "read",
        pathOrDescriptor: metadataPath,
      });
    }),
  );

  it.effect.skipIf(process.getuid?.() === 0)(
    "reports the read failure of unreadable metadata",
    () =>
      Effect.gen(function* () {
        const { root, metadataPath } = bundle((target) => {
          nodeFs.writeFileSync(target, metadata());
          nodeFs.chmodSync(target, 0o000);
        });

        expect(failureOf(yield* importBundle(root, metadataPath))).toEqual({
          reason: "PermissionDenied",
          method: "readFile",
          syscall: "open",
          pathOrDescriptor: metadataPath,
        });
      }),
  );

  it.effect("reports the access failure of a symlink loop at the metadata path", () =>
    Effect.gen(function* () {
      const { root, metadataPath } = bundle((target) => nodeFs.symlinkSync(target, target));

      expect(failureOf(yield* importBundle(root, metadataPath))).toEqual({
        reason: "BadResource",
        method: "access",
        syscall: "access",
        pathOrDescriptor: metadataPath,
      });
    }),
  );
});
