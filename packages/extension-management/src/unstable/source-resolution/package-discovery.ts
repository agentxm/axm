import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError, type AppError } from "../app-error/index.js";
import {
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_SKIPPED_DIRECTORIES,
} from "../extensions/discovery-walk.js";
import type {
  ExtensionName,
  ExtensionType,
  Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  ManifestIdentitySchema,
  manifestFilenameForType,
  manifestSchemaForType,
  validateManifestHasNoAgentsField,
  type ManifestIdentity,
} from "@agentxm/registry-protocol/unstable/publish/manifest-policy";

export interface ExtensionPackageFilter {
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly type: ExtensionType | "*";
}

export interface DiscoveredExtensionPackage {
  readonly directory: string;
  readonly identity: ManifestIdentity;
}

const typeForManifestFilename = (fileName: string): ExtensionType | undefined => {
  switch (fileName) {
    case "skill.json":
      return "skill";
    case "mcp.json":
      return "mcp-server";
    case "subagent.json":
      return "subagent";
    case "rule.json":
      return "rule";
    case "hook.json":
      return "hook";
    case "knowledge.json":
      return "knowledge";
    case "pack.json":
      return "pack";
    default:
      return undefined;
  }
};

const matchesFilter = (
  identity: {
    readonly owner: Handle;
    readonly type: ExtensionType;
    readonly name: ExtensionName;
  },
  filter: ExtensionPackageFilter,
): boolean =>
  (filter.type === "*" || filter.type === identity.type) &&
  (filter.names.length === 0 || filter.names.includes(identity.name)) &&
  (Option.isNone(filter.owner) || filter.owner.value === identity.owner);

export const inspectExtensionPackage = (
  directory: string,
): Effect.Effect<DiscoveredExtensionPackage, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(directory).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `AXM package directory could not be read: ${directory}`,
          cause,
        }),
      ),
    );
    const manifestEntries = entries
      .filter((entry) => typeForManifestFilename(entry) !== undefined)
      .sort();
    const manifestFile = manifestEntries[0];
    if (manifestFile === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `No AXM extension manifest was found at ${directory}; use skills import or subagents import for supported unmanaged/native content`,
      });
    }
    if (manifestEntries.length > 1) {
      return yield* makeAppError({
        code: "validation",
        detail: `Multiple AXM extension manifests were found at ${directory}: ${manifestEntries.join(", ")}`,
      });
    }
    const type = typeForManifestFilename(manifestFile);
    if (type === undefined) {
      return yield* makeAppError({
        code: "internal",
        detail: `Manifest type could not be determined for ${manifestFile}`,
      });
    }
    const manifestPath = path.join(directory, manifestFile);
    const text = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `AXM manifest could not be read: ${manifestPath}`,
          cause,
        }),
      ),
    );
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `AXM manifest contains invalid JSON: ${manifestPath}`,
          cause,
        }),
      ),
    );
    yield* Effect.fromResult(validateManifestHasNoAgentsField(manifestFile, raw)).pipe(
      Effect.mapError((cause) => makeAppError({ code: "validation", detail: cause.detail, cause })),
    );
    yield* Schema.decodeUnknownEffect(manifestSchemaForType(type))(raw).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `AXM manifest does not conform to ${manifestFile}: ${manifestPath}`,
          cause,
        }),
      ),
    );
    const identity = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema)(raw).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `AXM manifest identity is invalid: ${manifestPath}`,
          cause,
        }),
      ),
    );
    if (identity.type !== type || manifestFilenameForType(identity.type) !== manifestFile) {
      return yield* makeAppError({
        code: "validation",
        detail: `AXM manifest filename and declared type disagree: ${manifestPath}`,
      });
    }
    return { directory, identity };
  });

export const discoverExtensionPackages = (
  root: string,
  filter: ExtensionPackageFilter,
): Effect.Effect<
  ReadonlyArray<DiscoveredExtensionPackage>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const scan = (
      directory: string,
      depth: number,
    ): Effect.Effect<ReadonlyArray<DiscoveredExtensionPackage>, AppError> =>
      Effect.gen(function* () {
        if (depth > DISCOVERY_MAX_DEPTH) return [];
        const entries = yield* fs.readDirectory(directory).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Extension source directory could not be read: ${directory}`,
              cause,
            }),
          ),
        );
        const manifests = entries.filter((entry) => typeForManifestFilename(entry) !== undefined);
        if (manifests.length > 0) {
          const candidate = yield* inspectExtensionPackage(directory).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          return matchesFilter(candidate.identity, filter) ? [candidate] : [];
        }
        if (depth === DISCOVERY_MAX_DEPTH) return [];

        const children = yield* Effect.forEach(
          entries.filter((entry) => !DISCOVERY_SKIPPED_DIRECTORIES.has(entry)).sort(),
          (entry) =>
            Effect.gen(function* () {
              const child = path.join(directory, entry);
              const link = yield* fs.readLink(child).pipe(Effect.option);
              if (Option.isSome(link)) return [];
              const info = yield* fs.stat(child).pipe(Effect.option);
              if (Option.isNone(info) || info.value.type !== "Directory") return [];
              return yield* scan(child, depth + 1);
            }),
          { concurrency: 16 },
        );
        return children.flat();
      });

    const exists = yield* fs
      .exists(root)
      .pipe(
        Effect.mapError((cause) =>
          makeAppError({ code: "validation", detail: `Source does not exist: ${root}`, cause }),
        ),
      );
    if (!exists) {
      return yield* makeAppError({ code: "not_found", detail: `Source does not exist: ${root}` });
    }
    const packages = yield* scan(path.resolve(root), 0);
    return [...packages].sort((left, right) => left.directory.localeCompare(right.directory));
  });
