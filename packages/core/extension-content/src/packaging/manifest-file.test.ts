import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";

import {
  extensionTypes,
  type ExtensionType,
  manifestFilenameForType,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { readExtensionManifest, readExtensionManifestCapture } from "./manifest-file.js";
import type { ManifestError } from "./manifest-policy.js";

const manifests = {
  skill: { owner: "@acme", type: "skill", name: "review", version: "1.0.0" },
  "mcp-server": {
    owner: "@acme",
    type: "mcp-server",
    name: "browser",
    version: "1.0.0",
    server: { name: "io.agentxm/browser", description: "Browser MCP", version: "1.0.0" },
  },
  subagent: {
    owner: "@acme",
    type: "subagent",
    name: "researcher",
    version: "1.0.0",
    description: "Research",
    core: { instructions: "src/instructions.md" },
  },
  pack: { owner: "@acme", type: "pack", name: "starter", version: "1.0.0", dependencies: {} },
  rule: { owner: "@acme", type: "rule", name: "policy", version: "1.0.0" },
  hook: {
    owner: "@acme",
    type: "hook",
    name: "audit",
    version: "1.0.0",
    implementations: [
      {
        id: "claude",
        protocol: "claude-code",
        bindings: [
          {
            id: "audit",
            event: "Stop",
            handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
          },
        ],
      },
    ],
  },
  knowledge: {
    owner: "@acme",
    type: "knowledge",
    name: "handbook",
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  },
} satisfies Record<ExtensionType, object>;

layer(NodeServices.layer, { excludeTestServices: true })("readExtensionManifest", (it) => {
  it.effect.each([
    { ...manifests.hook, fallback: "auto" },
    {
      ...manifests.hook,
      implementations: [
        {
          id: "claude",
          protocol: "claude-code",
          bindings: [
            {
              id: "audit",
              event: "Stop",
              handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh", async: true },
            },
          ],
        },
      ],
    },
  ])("rejects obsolete or unsupported native Hook fields %#", (manifest) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "hook.json"), JSON.stringify(manifest));
      const failure = yield* Effect.flip(readExtensionManifest(root, "hook"));
      expect(failure.code).toBe("manifest_schema_invalid");
    }).pipe(Effect.scoped),
  );
  it.effect("reads and validates every manifest kind", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();

      for (const type of extensionTypes) {
        const directory = path.join(root, type);
        yield* fs.makeDirectory(directory);
        const fileName = manifestFilenameForType(type);
        yield* fs.writeFileString(path.join(directory, fileName), JSON.stringify(manifests[type]));

        const result = yield* readExtensionManifest(directory, type);
        expect(result.fileName).toBe(fileName);
        expect(result.path).toBe(path.join(directory, fileName));
        expect(result.identity.type).toBe(type);
        expect(result.identity.owner).toBe("@acme");
      }
    }).pipe(Effect.scoped),
  );

  it.effect("distinguishes missing, unreadable, and invalid JSON manifests", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const missing = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(missing.code).toBe("manifest_missing");

      const manifestPath = path.join(root, "skill.json");
      yield* fs.makeDirectory(manifestPath);
      const unreadable = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(unreadable.code).toBe("manifest_unreadable");
      expect(unreadable.cause).toBeDefined();

      yield* fs.remove(manifestPath, { recursive: true });
      yield* fs.writeFileString(manifestPath, "{not json");
      const invalid = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(invalid.code).toBe("manifest_invalid_json");
    }).pipe(Effect.scoped),
  );

  it.effect("rejects schema-invalid and mismatched declared types", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const manifestPath = path.join(root, "skill.json");
      yield* fs.writeFileString(
        manifestPath,
        JSON.stringify({ owner: "@acme", type: "skill", version: "1.0.0" }),
      );
      const missingName = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(missingName.code).toBe("manifest_schema_invalid");
      expect(missingName.details).toBeDefined();

      yield* fs.writeFileString(
        manifestPath,
        JSON.stringify({ owner: "@acme", type: "subagent", name: "review", version: "1.0.0" }),
      );
      const wrongType = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(wrongType.code).toBe("manifest_schema_invalid");
    }).pipe(Effect.scoped),
  );

  it.effect("fills only an absent owner from the caller's default", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const manifestPath = path.join(root, "skill.json");
      yield* fs.writeFileString(
        manifestPath,
        JSON.stringify({ type: "skill", name: "review", version: "1.0.0" }),
      );
      const defaultOwner = decodeHandleSync("@acme");
      const filled = yield* readExtensionManifest(root, "skill", { defaultOwner });
      expect(filled.identity.owner).toBe("@acme");
      expect(filled.raw).toMatchObject({ owner: "@acme" });

      yield* fs.writeFileString(manifestPath, JSON.stringify(manifests.skill));
      const preserved = yield* readExtensionManifest(root, "skill", {
        defaultOwner: decodeHandleSync("@other"),
      });
      expect(preserved.identity.owner).toBe("@acme");
    }).pipe(Effect.scoped),
  );
});

/**
 * Record the primitive calls naming `target`. Derived operations such as
 * `exists` and `readFileString` are rebuilt over these primitives, so each is
 * recorded as the primitive it performs.
 */
const recordingFileSystem = (base: FileSystem.FileSystem, target: string) => {
  const calls: Array<string> = [];
  const recorded =
    <Args extends ReadonlyArray<unknown>, A, E, R>(
      method: string,
      operation: (path: string, ...args: Args) => Effect.Effect<A, E, R>,
    ) =>
    (path: string, ...args: Args) =>
      path === target
        ? operation(path, ...args).pipe(
            Effect.onExit((exit) =>
              Effect.sync(() => {
                calls.push(`${method}:${Exit.isSuccess(exit) ? "success" : "failure"}`);
              }),
            ),
          )
        : operation(path, ...args);
  const fileSystem = FileSystem.make({
    ...base,
    access: recorded("access", base.access),
    lstat: recorded("lstat", base.lstat),
    open: recorded("open", base.open),
    readFile: recorded("readFile", base.readFile),
    readLink: recorded("readLink", base.readLink),
    realPath: recorded("realPath", base.realPath),
    stat: recorded("stat", base.stat),
  });
  return { fileSystem, calls };
};

/** The calls one read performs on the manifest path, and how it reports the outcome. */
const recordedRead = (directory: string, type: ExtensionType) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { fileSystem, calls } = recordingFileSystem(
      yield* FileSystem.FileSystem,
      path.join(directory, manifestFilenameForType(type)),
    );
    const result = yield* readExtensionManifest(directory, type).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.result,
    );
    return { result, calls };
  });

const failureOf = <A>(result: Result.Result<A, ManifestError>) =>
  Result.isFailure(result)
    ? {
        code: result.failure.code,
        detail: result.failure.detail,
        platformReason: PlatformError.isPlatformError(result.failure.cause)
          ? result.failure.cause.reason._tag
          : undefined,
      }
    : undefined;

/** The superuser reads through mode bits, so permission cases cannot be staged. */
const permissionBitsIgnored = process.getuid?.() === 0;

/** Restore access before the scoped temporary directory is removed. */
const withMode = (target: string, mode: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.chmod(target, mode);
    yield* Effect.addFinalizer(() => fs.chmod(target, 0o755).pipe(Effect.ignore));
  });

layer(NodeServices.layer, { excludeTestServices: true })("manifest reads", (it) => {
  it.effect("reads a present manifest without a separate presence probe", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "skill.json"), JSON.stringify(manifests.skill));
      const { result, calls } = yield* recordedRead(root, "skill");
      expect(Result.isSuccess(result)).toBe(true);
      expect(calls).toEqual(["readFile:success"]);
    }).pipe(Effect.scoped),
  );

  it.effect("reports an absent manifest from the failed read alone", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const { result, calls } = yield* recordedRead(root, "skill");
      expect(failureOf(result)).toEqual({
        code: "manifest_missing",
        detail: `Expected manifest file "skill.json" not found in ${root}.`,
        platformReason: undefined,
      });
      expect(calls).toEqual(["readFile:failure"]);
    }).pipe(Effect.scoped),
  );

  it.effect("reports a dangling manifest link as absent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.symlink(path.join(root, "gone.json"), path.join(root, "skill.json"));
      const { result, calls } = yield* recordedRead(root, "skill");
      expect(failureOf(result)).toEqual({
        code: "manifest_missing",
        detail: `Expected manifest file "skill.json" not found in ${root}.`,
        platformReason: undefined,
      });
      expect(calls).toEqual(["readFile:failure"]);
    }).pipe(Effect.scoped),
  );

  it.effect.skipIf(permissionBitsIgnored)(
    "keeps an unreadable manifest distinct from absence",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(root, "skill.json"), JSON.stringify(manifests.skill));
        yield* withMode(path.join(root, "skill.json"), 0o000);
        const { result, calls } = yield* recordedRead(root, "skill");
        expect(failureOf(result)).toEqual({
          code: "manifest_unreadable",
          detail: `Manifest file "${path.join(root, "skill.json")}" could not be read.`,
          platformReason: "PermissionDenied",
        });
        expect(calls).toEqual(["readFile:failure", "access:success"]);
      }).pipe(Effect.scoped),
  );

  it.effect("keeps a directory at the manifest path distinct from absence", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, "skill.json"));
      const { result, calls } = yield* recordedRead(root, "skill");
      expect(failureOf(result)).toEqual({
        code: "manifest_unreadable",
        detail: `Manifest file "${path.join(root, "skill.json")}" could not be read.`,
        platformReason: "BadResource",
      });
      expect(calls).toEqual(["readFile:failure", "access:success"]);
    }).pipe(Effect.scoped),
  );

  it.effect.skipIf(permissionBitsIgnored)(
    "keeps an unsearchable package directory distinct from absence",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const sealed = path.join(root, "sealed");
        yield* fs.makeDirectory(sealed);
        yield* fs.writeFileString(path.join(sealed, "skill.json"), JSON.stringify(manifests.skill));
        yield* withMode(sealed, 0o000);
        const { result, calls } = yield* recordedRead(sealed, "skill");
        expect(failureOf(result)).toEqual({
          code: "manifest_unreadable",
          detail: `Manifest file "${path.join(sealed, "skill.json")}" could not be inspected.`,
          platformReason: "PermissionDenied",
        });
        expect(calls).toEqual(["readFile:failure", "access:failure"]);
      }).pipe(Effect.scoped),
  );

  it.effect("keeps a file in place of the package directory distinct from absence", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "file");
      yield* fs.writeFileString(file, "not a directory");
      const { result, calls } = yield* recordedRead(file, "skill");
      expect(failureOf(result)).toEqual({
        code: "manifest_unreadable",
        detail: `Manifest file "${path.join(file, "skill.json")}" could not be inspected.`,
        platformReason: "BadResource",
      });
      expect(calls).toEqual(["readFile:failure", "access:failure"]);
    }).pipe(Effect.scoped),
  );

  it.effect("judges an empty manifest by its content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "skill.json"), "");
      const { result, calls } = yield* recordedRead(root, "skill");
      expect(failureOf(result)).toEqual({
        code: "manifest_invalid_json",
        detail: `Manifest file "skill.json" contains invalid JSON.`,
        platformReason: undefined,
      });
      expect(calls).toEqual(["readFile:success"]);
    }).pipe(Effect.scoped),
  );
});

layer(NodeServices.layer, { excludeTestServices: true })("manifest text capture", (it) => {
  const decodedDisk = (file: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return new TextDecoder().decode(yield* fs.readFile(file));
    });

  it.effect("returns the text it decoded alongside the manifest", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "skill.json");
      yield* fs.writeFileString(
        file,
        `${JSON.stringify({ ...manifests.skill, description: "Révision ✓" }, null, 2)}\n`,
      );
      const capture = yield* readExtensionManifestCapture(root, "skill");
      expect(capture.text).toEqual(Option.some(yield* decodedDisk(file)));
      expect(capture.result).toEqual(Result.succeed(yield* readExtensionManifest(root, "skill")));
    }).pipe(Effect.scoped),
  );

  it.effect.each([
    { type: "skill", content: "{not json", code: "manifest_invalid_json" },
    {
      type: "hook",
      content: JSON.stringify({ ...manifests.hook, fallback: "auto" }),
      code: "manifest_schema_invalid",
    },
  ] as const)(
    "returns the text of a manifest that fails to decode: $code",
    ({ type, content, code }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, manifestFilenameForType(type));
        yield* fs.writeFileString(file, content);
        const capture = yield* readExtensionManifestCapture(root, type);
        expect(capture.text).toEqual(Option.some(yield* decodedDisk(file)));
        expect(failureOf(capture.result)?.code).toBe(code);
        const read = yield* Effect.flip(readExtensionManifest(root, type));
        expect(capture.result).toEqual(Result.fail(read));
      }).pipe(Effect.scoped),
  );

  it.effect("returns no text when the read fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const missing = yield* readExtensionManifestCapture(root, "skill");
      expect(missing.text).toEqual(Option.none());
      expect(failureOf(missing.result)?.code).toBe("manifest_missing");

      yield* fs.makeDirectory(path.join(root, "skill.json"));
      const unreadable = yield* readExtensionManifestCapture(root, "skill");
      expect(unreadable.text).toEqual(Option.none());
      expect(failureOf(unreadable.result)?.code).toBe("manifest_unreadable");
    }).pipe(Effect.scoped),
  );
});
