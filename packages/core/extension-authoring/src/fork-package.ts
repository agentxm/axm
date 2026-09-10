import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import {
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
} from "@agentxm/extension-workspace";
import {
  ManifestIdentitySchema,
  manifestFilenameForType,
  manifestSchemaForType,
  type ManifestIdentity,
} from "@agentxm/registry-protocol/unstable/publish/manifest-policy";
import { copyExtensionDirectory } from "@agentxm/extension-workspace";
import {
  parseFrontmatterEffect,
  type FrontmatterParseFailure,
} from "@agentxm/registry-protocol/unstable/content/frontmatter";
import type {
  ExtensionFqnParts,
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

const INITIAL_FORK_VERSION = "0.1.0";

export interface ForkExtensionPackageArgs {
  readonly sourceDir: string;
  readonly targetDir: string;
  readonly sourceIdentity: {
    readonly owner: Handle;
    readonly type: ExtensionType;
    readonly name: ExtensionName;
    readonly version: string;
  };
  readonly target: ExtensionFqnParts;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = (
  filePath: string,
): Effect.Effect<unknown, ForkPackageInvalid, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(filePath)
      .pipe(
        Effect.mapError(
          (cause) =>
            new ForkPackageInvalid({ detail: `Manifest could not be read: ${filePath}`, cause }),
        ),
      );
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageInvalid({ detail: `Manifest contains invalid JSON: ${filePath}`, cause }),
      ),
    );
  });

const validateSourceIdentity = (
  actual: ManifestIdentity,
  expected: ForkExtensionPackageArgs["sourceIdentity"],
): Effect.Effect<void, ForkPackageConflict> =>
  actual.owner === expected.owner &&
  actual.type === expected.type &&
  actual.name === expected.name &&
  actual.version === expected.version
    ? Effect.void
    : new ForkPackageConflict({
        detail: `Fork source changed after it was resolved; expected ${expected.owner}/${expected.type}/${expected.name}@${expected.version}`,
      });

const validateContainedSymlinks = (
  sourceRoot: string,
): Effect.Effect<void, ForkPackageInvalid, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const realRoot = yield* fs.realPath(sourceRoot).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageInvalid({
            detail: `Fork source could not be resolved: ${sourceRoot}`,
            cause,
          }),
      ),
    );
    const entries = yield* fs.readDirectory(sourceRoot, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageInvalid({
            detail: `Fork source could not be inspected: ${sourceRoot}`,
            cause,
          }),
      ),
    );
    yield* Effect.forEach(
      entries,
      (relativePath) =>
        Effect.gen(function* () {
          const entry = path.join(sourceRoot, relativePath);
          const link = yield* fs.readLink(entry).pipe(Effect.option);
          if (Option.isNone(link)) return;
          const realTarget = yield* fs.realPath(entry).pipe(
            Effect.mapError(
              (cause) =>
                new ForkPackageInvalid({
                  detail: `Fork source contains an unresolved symlink: ${entry}`,
                  cause,
                }),
            ),
          );
          const contained =
            realTarget === realRoot || realTarget.startsWith(`${realRoot}${path.sep}`);
          if (!contained) {
            return yield* new ForkPackageInvalid({
              detail: `Fork source symlink escapes the package root: ${entry}`,
            });
          }
        }),
      { concurrency: 16, discard: true },
    );
  });

const rewriteFrontmatterName = (
  filePath: string,
  targetName: ExtensionName,
): Effect.Effect<
  void,
  ForkPackageInvalid | ForkPackageFailed | FrontmatterParseFailure,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageInvalid({
            detail: `Extension content could not be read: ${filePath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* parseFrontmatterEffect(content);
    if (!isRecord(parsed.frontmatter)) {
      return yield* new ForkPackageInvalid({
        detail: `Extension content must have YAML frontmatter: ${filePath}`,
      });
    }
    const frontmatter = { ...parsed.frontmatter, name: targetName };
    const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trim();
    const body = parsed.body.startsWith("\n") ? parsed.body : `\n${parsed.body}`;
    yield* fs.writeFileString(filePath, `---\n${yaml}\n---${body}`).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageFailed({
            detail: `Extension frontmatter could not be rewritten: ${filePath}`,
            cause,
          }),
      ),
    );
  });

const rewriteTypeSpecificIdentity = (
  targetDir: string,
  source: ForkExtensionPackageArgs["sourceIdentity"],
  target: ExtensionFqnParts,
): Effect.Effect<
  void,
  ForkPackageInvalid | ForkPackageFailed | FrontmatterParseFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    switch (target.type) {
      case "skill":
        yield* rewriteFrontmatterName(path.join(targetDir, "src", "SKILL.md"), target.name).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        );
        return;
      case "subagent": {
        const sourcePath = path.join(targetDir, "src", `${source.name}.md`);
        const targetPath = path.join(targetDir, "src", `${target.name}.md`);
        yield* rewriteFrontmatterName(sourcePath, target.name).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        );
        if (sourcePath !== targetPath) {
          yield* fs.rename(sourcePath, targetPath).pipe(
            Effect.mapError(
              (cause) =>
                new ForkPackageFailed({
                  detail: `Subagent content could not be renamed to ${target.name}.md`,
                  cause,
                }),
            ),
          );
        }
        return;
      }
      case "mcp-server":
      case "rule":
      case "hook":
      case "knowledge":
      case "pack":
        return;
    }
  });

export const forkExtensionPackage = (
  args: ForkExtensionPackageArgs,
): Effect.Effect<
  void,
  ForkPackageInvalid | ForkPackageConflict | ForkPackageFailed | FrontmatterParseFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (args.sourceIdentity.type !== args.target.type) {
      return yield* new ForkPackageInvalid({
        detail: `Cannot fork ${args.sourceIdentity.type} as ${args.target.type}; source and target types must match`,
      });
    }
    const targetExists = yield* fs.exists(args.targetDir).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageFailed({
            detail: `Fork target could not be inspected: ${args.targetDir}`,
            cause,
          }),
      ),
    );
    if (targetExists) {
      return yield* new ForkPackageConflict({
        detail: `Fork target already exists: ${args.targetDir}`,
      });
    }
    const sourceManifestPath = path.join(
      args.sourceDir,
      manifestFilenameForType(args.sourceIdentity.type),
    );
    const raw = yield* readJson(sourceManifestPath).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
    );
    const identity = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema)(raw).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageInvalid({
            detail: `Fork source manifest identity is invalid: ${sourceManifestPath}`,
            cause,
          }),
      ),
    );
    yield* validateSourceIdentity(identity, args.sourceIdentity);
    if (!isRecord(raw)) {
      return yield* new ForkPackageInvalid({
        detail: `Fork source manifest must contain a JSON object: ${sourceManifestPath}`,
      });
    }
    yield* validateContainedSymlinks(args.sourceDir).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    yield* copyExtensionDirectory(args.sourceDir, args.targetDir).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageFailed({
            detail: `Failed to copy AXM package from ${args.sourceDir} to ${args.targetDir}`,
            cause,
          }),
      ),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    const targetManifestPath = path.join(args.targetDir, manifestFilenameForType(args.target.type));
    const rewritten = {
      ...raw,
      owner: args.target.owner,
      type: args.target.type,
      name: args.target.name,
      version: INITIAL_FORK_VERSION,
    };
    yield* fs.writeFileString(targetManifestPath, `${JSON.stringify(rewritten, null, 2)}\n`).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageFailed({
            detail: `Fork target manifest could not be written: ${targetManifestPath}`,
            cause,
          }),
      ),
    );
    yield* rewriteTypeSpecificIdentity(args.targetDir, args.sourceIdentity, args.target).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    yield* Schema.decodeUnknownEffect(manifestSchemaForType(args.target.type))(rewritten).pipe(
      Effect.mapError(
        (cause) =>
          new ForkPackageInvalid({
            detail: `Fork target manifest is invalid: ${targetManifestPath}`,
            cause,
          }),
      ),
    );
  });
